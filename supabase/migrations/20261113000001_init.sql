-- =====================================================================
-- Настрой — социальный трекер настроения
-- Базовая схема: профили, записи настроения, друзья, приватность,
-- уведомления, push-подписки, хранилище файлов.
-- Вся защита данных — через RLS и security definer функции с явными проверками.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- Служебная схема для внутренних функций (не публикуется через API)
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Типы
-- ---------------------------------------------------------------------
create type public.day_part as enum ('morning', 'day', 'evening', 'night');

-- ---------------------------------------------------------------------
-- Общая функция обновления updated_at
-- ---------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- =====================================================================
-- PROFILES
-- =====================================================================
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  username     text not null unique
               check (username ~ '^[a-z0-9_]{3,24}$'),
  display_name text not null
               check (char_length(btrim(display_name)) between 1 and 50),
  avatar_url   text check (avatar_url is null or char_length(avatar_url) <= 500),
  timezone     text not null default 'UTC',
  onboarded    boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.profiles is 'Публичный профиль пользователя';

-- Проверка корректности часового пояса
create or replace function private.validate_timezone()
returns trigger
language plpgsql
as $$
begin
  if not exists (select 1 from pg_timezone_names where name = new.timezone) then
    raise exception 'Некорректный часовой пояс: %', new.timezone using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger profiles_validate_tz
  before insert or update of timezone on public.profiles
  for each row execute function private.validate_timezone();

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

-- Текущая дата в часовом поясе пользователя
create or replace function private.user_today(p_user uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select (now() at time zone p.timezone)::date from public.profiles p where p.id = p_user),
    (now() at time zone 'UTC')::date
  );
$$;

-- =====================================================================
-- PRIVACY SETTINGS
-- =====================================================================
create table public.privacy_settings (
  user_id               uuid primary key references public.profiles (id) on delete cascade,
  -- friends: друзья видят разрешённое ниже; private: полностью закрытый профиль
  profile_visibility    text not null default 'friends'
                        check (profile_visibility in ('friends', 'private')),
  -- none: не показывать настроение; today: только сегодняшнее; latest: последнее
  mood_visibility       text not null default 'latest'
                        check (mood_visibility in ('none', 'today', 'latest')),
  calendar_visibility   boolean not null default true,
  statistics_visibility boolean not null default true,
  notes_visibility      boolean not null default false,  -- заметки приватны по умолчанию
  photos_visibility     boolean not null default false,  -- фото приватны по умолчанию
  updated_at            timestamptz not null default now()
);

create trigger privacy_updated_at
  before update on public.privacy_settings
  for each row execute function private.set_updated_at();

-- =====================================================================
-- NOTIFICATION SETTINGS
-- =====================================================================
create table public.notification_settings (
  user_id                uuid primary key references public.profiles (id) on delete cascade,
  push_enabled           boolean not null default false,
  inapp_enabled          boolean not null default true,
  friend_mood_enabled    boolean not null default true,   -- друг отметил настроение
  friend_update_enabled  boolean not null default true,   -- друг изменил настроение
  friend_request_enabled boolean not null default true,   -- заявки и новые друзья
  updated_at             timestamptz not null default now()
);

create trigger notification_settings_updated_at
  before update on public.notification_settings
  for each row execute function private.set_updated_at();

-- Отключённые уведомления от конкретных друзей
create table public.muted_friends (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  muted_id   uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, muted_id),
  check (user_id <> muted_id)
);

-- =====================================================================
-- MOOD ENTRIES
-- =====================================================================
create table public.mood_entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  -- Дата дня в часовом поясе пользователя (одна основная отметка в день)
  entry_date  date not null,
  mood_value  smallint not null check (mood_value between 1 and 5),
  mood_label  text generated always as (
                case mood_value
                  when 5 then 'Отлично'
                  when 4 then 'Хорошо'
                  when 3 then 'Нейтрально'
                  when 2 then 'Грустно'
                  else 'Плохо'
                end
              ) stored,
  note        text check (note is null or char_length(note) <= 2000),
  photo_path  text check (photo_path is null or char_length(photo_path) <= 300),
  -- Момент, к которому относится настроение (не время сохранения)
  mood_time   timestamptz not null,
  -- Часть суток по локальному времени пользователя
  day_part    public.day_part not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, entry_date),
  -- Фото может лежать только в папке владельца
  check (photo_path is null or photo_path like (user_id::text || '/%'))
);

create index mood_entries_user_date_idx on public.mood_entries (user_id, entry_date desc);
create index mood_entries_updated_idx on public.mood_entries (user_id, updated_at desc);

create trigger mood_entries_updated_at
  before update on public.mood_entries
  for each row execute function private.set_updated_at();

-- =====================================================================
-- FRIENDSHIPS
-- =====================================================================
create table public.friendships (
  id           uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at   timestamptz not null default now(),
  accepted_at  timestamptz,
  check (requester_id <> addressee_id)
);

-- Одна связь на пару пользователей, независимо от направления
create unique index friendships_pair_uidx
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index friendships_requester_idx on public.friendships (requester_id, status);
create index friendships_addressee_idx on public.friendships (addressee_id, status);

-- Защита: менять можно только статус pending -> accepted
create or replace function private.friendships_guard()
returns trigger
language plpgsql
as $$
begin
  if new.requester_id <> old.requester_id or new.addressee_id <> old.addressee_id then
    raise exception 'Нельзя менять участников дружбы' using errcode = '42501';
  end if;
  if not (old.status = 'pending' and new.status = 'accepted') then
    raise exception 'Недопустимое изменение статуса' using errcode = '42501';
  end if;
  new.accepted_at := now();
  new.created_at := old.created_at;
  return new;
end;
$$;

create trigger friendships_guard
  before update on public.friendships
  for each row execute function private.friendships_guard();

-- Являются ли два пользователя друзьями
create or replace function private.are_friends(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and least(f.requester_id, f.addressee_id) = least(a, b)
      and greatest(f.requester_id, f.addressee_id) = greatest(a, b)
  );
$$;

-- =====================================================================
-- NOTIFICATIONS
-- =====================================================================
create table public.notifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  actor_id     uuid references public.profiles (id) on delete cascade,
  type         text not null check (type in (
                 'friend_request', 'request_accepted', 'new_friend',
                 'friend_mood', 'friend_mood_updated')),
  reference_id uuid,
  -- Безопасный снимок данных для текста (без заметок и фото)
  data         jsonb not null default '{}'::jsonb,
  is_read      boolean not null default false,
  created_at   timestamptz not null default now()
);

create index notifications_user_created_idx on public.notifications (user_id, created_at desc);
create index notifications_user_unread_idx on public.notifications (user_id) where not is_read;
create index notifications_reference_idx on public.notifications (reference_id);

-- =====================================================================
-- PUSH SUBSCRIPTIONS
-- =====================================================================
create table public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  endpoint     text not null unique,
  subscription jsonb not null,
  user_agent   text,
  -- web — Web Push; в будущем fcm/apns для нативных приложений
  platform     text not null default 'web' check (platform in ('web', 'fcm', 'apns')),
  created_at   timestamptz not null default now()
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- =====================================================================
-- Создание профиля и настроек при регистрации
-- =====================================================================
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username text;
  v_name     text;
  v_tz       text;
begin
  v_username := lower(coalesce(new.raw_user_meta_data ->> 'username', ''));
  if v_username !~ '^[a-z0-9_]{3,24}$' then
    v_username := 'user_' || substr(replace(new.id::text, '-', ''), 1, 10);
  end if;

  v_name := btrim(coalesce(new.raw_user_meta_data ->> 'display_name', ''));
  if char_length(v_name) = 0 then
    v_name := v_username;
  end if;
  v_name := left(v_name, 50);

  v_tz := coalesce(new.raw_user_meta_data ->> 'timezone', 'UTC');
  if not exists (select 1 from pg_timezone_names where name = v_tz) then
    v_tz := 'UTC';
  end if;

  insert into public.profiles (id, username, display_name, timezone)
  values (new.id, v_username, v_name, v_tz);

  insert into public.privacy_settings (user_id) values (new.id);
  insert into public.notification_settings (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- =====================================================================
-- Видимость данных друга
-- =====================================================================

-- Может ли viewer видеть историю (календарь/статистику) владельца
create or replace function private.can_see_history(p_owner uuid, p_viewer uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_owner = p_viewer or (
    private.are_friends(p_owner, p_viewer)
    and exists (
      select 1 from public.privacy_settings s
      where s.user_id = p_owner
        and s.profile_visibility = 'friends'
        and (s.calendar_visibility or s.statistics_visibility)
    )
  );
$$;

-- Последняя видимая viewer'у запись владельца (с учётом mood_visibility)
create or replace function private.visible_latest_entry(p_owner uuid, p_viewer uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select e.id
  from public.mood_entries e
  join public.privacy_settings s on s.user_id = e.user_id
  where e.user_id = p_owner
    and (p_owner = p_viewer or (
      private.are_friends(p_owner, p_viewer)
      and s.profile_visibility = 'friends'
      and (
        s.mood_visibility = 'latest'
        or (s.mood_visibility = 'today' and e.entry_date = private.user_today(p_owner))
      )
    ))
  order by e.entry_date desc
  limit 1;
$$;

-- =====================================================================
-- Триггеры уведомлений
-- =====================================================================

-- Создать уведомление с учётом настроек получателя
create or replace function private.notify(
  p_user uuid, p_actor uuid, p_type text, p_reference uuid, p_data jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.notification_settings;
begin
  select * into s from public.notification_settings where user_id = p_user;
  if not found then
    return;
  end if;
  -- Ни внутренние, ни push не нужны — ничего не создаём
  if not (s.inapp_enabled or s.push_enabled) then
    return;
  end if;
  if p_type in ('friend_request', 'request_accepted', 'new_friend') and not s.friend_request_enabled then
    return;
  end if;
  if p_type = 'friend_mood' and not s.friend_mood_enabled then
    return;
  end if;
  if p_type = 'friend_mood_updated' and not s.friend_update_enabled then
    return;
  end if;
  if p_type in ('friend_mood', 'friend_mood_updated') and exists (
    select 1 from public.muted_friends m where m.user_id = p_user and m.muted_id = p_actor
  ) then
    return;
  end if;

  insert into public.notifications (user_id, actor_id, type, reference_id, data)
  values (p_user, p_actor, p_type, p_reference, coalesce(p_data, '{}'::jsonb));
end;
$$;

-- Отметка настроения -> уведомить друзей
create or replace function private.on_mood_entry_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type   text;
  v_today  date;
  v_priv   public.privacy_settings;
  v_friend uuid;
begin
  if tg_op = 'DELETE' then
    delete from public.notifications where reference_id = old.id;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    -- Уведомляем только при смене самого настроения
    if new.mood_value = old.mood_value then
      return new;
    end if;
    v_type := 'friend_mood_updated';
  else
    v_type := 'friend_mood';
  end if;

  select * into v_priv from public.privacy_settings where user_id = new.user_id;
  if not found or v_priv.profile_visibility = 'private' or v_priv.mood_visibility = 'none' then
    return new;
  end if;

  -- Не шумим о записях задним числом
  v_today := private.user_today(new.user_id);
  if new.entry_date < v_today - 1 then
    return new;
  end if;
  if v_priv.mood_visibility = 'today' and new.entry_date <> v_today then
    return new;
  end if;

  for v_friend in
    select case when f.requester_id = new.user_id then f.addressee_id else f.requester_id end
    from public.friendships f
    where f.status = 'accepted'
      and (f.requester_id = new.user_id or f.addressee_id = new.user_id)
  loop
    -- Заменяем непрочитанное уведомление по этой же записи, чтобы не копить дубли
    delete from public.notifications n
    where n.user_id = v_friend and n.reference_id = new.id and not n.is_read;

    perform private.notify(
      v_friend, new.user_id, v_type, new.id,
      jsonb_build_object('mood_value', new.mood_value, 'entry_date', new.entry_date)
    );
  end loop;

  return new;
end;
$$;

create trigger mood_entries_notify
  after insert or update or delete on public.mood_entries
  for each row execute function private.on_mood_entry_change();

-- Заявки в друзья -> уведомления
create or replace function private.on_friendship_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.notify(new.addressee_id, new.requester_id, 'friend_request', new.id, '{}'::jsonb);
    return new;
  elsif tg_op = 'UPDATE' then
    if old.status = 'pending' and new.status = 'accepted' then
      -- Заявка обработана — убираем её из уведомлений получателя
      delete from public.notifications
      where reference_id = new.id and type = 'friend_request';
      perform private.notify(new.requester_id, new.addressee_id, 'request_accepted', new.id, '{}'::jsonb);
      perform private.notify(new.addressee_id, new.requester_id, 'new_friend', new.id, '{}'::jsonb);
    end if;
    return new;
  else
    delete from public.notifications where reference_id = old.id;
    return old;
  end if;
end;
$$;

create trigger friendships_notify
  after insert or update or delete on public.friendships
  for each row execute function private.on_friendship_change();

-- =====================================================================
-- RLS
-- =====================================================================
alter table public.profiles              enable row level security;
alter table public.privacy_settings      enable row level security;
alter table public.notification_settings enable row level security;
alter table public.muted_friends         enable row level security;
alter table public.mood_entries          enable row level security;
alter table public.friendships           enable row level security;
alter table public.notifications         enable row level security;
alter table public.push_subscriptions    enable row level security;

-- Профили: базовые данные видны вошедшим пользователям (нужно для поиска друзей)
create policy "profiles: читать вошедшим"
  on public.profiles for select to authenticated using (true);
create policy "profiles: менять свой"
  on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Приватность и настройки уведомлений: только свои
create policy "privacy: свои"
  on public.privacy_settings for select to authenticated using (user_id = (select auth.uid()));
create policy "privacy: менять свои"
  on public.privacy_settings for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "notif_settings: свои"
  on public.notification_settings for select to authenticated using (user_id = (select auth.uid()));
create policy "notif_settings: менять свои"
  on public.notification_settings for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "muted: свои"
  on public.muted_friends for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Записи настроения: напрямую — только владелец.
-- Друзья получают данные через функции get_friend_* с проверкой приватности.
create policy "mood: читать свои"
  on public.mood_entries for select to authenticated using (user_id = (select auth.uid()));
create policy "mood: создавать свои"
  on public.mood_entries for insert to authenticated with check (user_id = (select auth.uid()));
create policy "mood: менять свои"
  on public.mood_entries for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "mood: удалять свои"
  on public.mood_entries for delete to authenticated using (user_id = (select auth.uid()));

-- Дружба
create policy "friendships: участники видят"
  on public.friendships for select to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));
create policy "friendships: отправить заявку"
  on public.friendships for insert to authenticated
  with check (requester_id = (select auth.uid()) and status = 'pending');
create policy "friendships: принять входящую"
  on public.friendships for update to authenticated
  using (addressee_id = (select auth.uid()) and status = 'pending')
  with check (addressee_id = (select auth.uid()) and status = 'accepted');
create policy "friendships: удалить/отменить/отклонить"
  on public.friendships for delete to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));

-- Уведомления: только свои (создаются триггерами)
create policy "notifications: свои"
  on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy "notifications: отмечать прочитанными"
  on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "notifications: удалять свои"
  on public.notifications for delete to authenticated using (user_id = (select auth.uid()));

-- Push-подписки: только свои
create policy "push: свои"
  on public.push_subscriptions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- =====================================================================
-- Права (явно, без доступа для anon)
-- =====================================================================
revoke all on all tables in schema public from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (username, display_name, avatar_url, timezone, onboarded) on public.profiles to authenticated;

grant select on public.privacy_settings to authenticated;
grant update (profile_visibility, mood_visibility, calendar_visibility, statistics_visibility,
              notes_visibility, photos_visibility) on public.privacy_settings to authenticated;

grant select on public.notification_settings to authenticated;
grant update (push_enabled, inapp_enabled, friend_mood_enabled, friend_update_enabled,
              friend_request_enabled) on public.notification_settings to authenticated;

grant select, insert, delete on public.muted_friends to authenticated;

grant select, delete on public.mood_entries to authenticated;
grant insert (user_id, entry_date, mood_value, note, photo_path, mood_time, day_part)
  on public.mood_entries to authenticated;
grant update (mood_value, note, photo_path, mood_time, day_part)
  on public.mood_entries to authenticated;

grant select, delete on public.friendships to authenticated;
grant insert (requester_id, addressee_id) on public.friendships to authenticated;
grant update (status) on public.friendships to authenticated;

grant select, delete on public.notifications to authenticated;
grant update (is_read) on public.notifications to authenticated;

grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- =====================================================================
-- RPC-функции для клиента
-- =====================================================================

-- Свободен ли username (доступно и до входа — для формы регистрации)
create or replace function public.username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select lower(p_username) ~ '^[a-z0-9_]{3,24}$'
     and not exists (select 1 from public.profiles where username = lower(p_username));
$$;

-- Отправить заявку в друзья. Если есть встречная заявка — сразу принимаем.
create or replace function public.send_friend_request(p_addressee uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  f public.friendships;
begin
  if v_me is null then
    raise exception 'Нужно войти' using errcode = '42501';
  end if;
  if p_addressee = v_me then
    raise exception 'Нельзя добавить себя' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_addressee) then
    raise exception 'Пользователь не найден' using errcode = 'P0002';
  end if;

  select * into f from public.friendships
  where least(requester_id, addressee_id) = least(v_me, p_addressee)
    and greatest(requester_id, addressee_id) = greatest(v_me, p_addressee);

  if found then
    if f.status = 'accepted' then
      return 'friends';
    elsif f.requester_id = v_me then
      return 'pending';
    else
      -- Встречная заявка: принимаем
      update public.friendships set status = 'accepted' where id = f.id;
      return 'friends';
    end if;
  end if;

  insert into public.friendships (requester_id, addressee_id) values (v_me, p_addressee);
  return 'pending';
end;
$$;

-- Профиль пользователя глазами текущего пользователя (с учётом приватности)
create or replace function public.get_user_profile(p_username text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me     uuid := auth.uid();
  p        public.profiles;
  s        public.privacy_settings;
  f        public.friendships;
  v_rel    text := 'none';
  v_is_friend boolean := false;
  v_open   boolean;
  v_latest jsonb;
  v_entry  uuid;
begin
  if v_me is null then
    raise exception 'Нужно войти' using errcode = '42501';
  end if;

  select * into p from public.profiles where username = lower(p_username);
  if not found then
    return null;
  end if;
  select * into s from public.privacy_settings where user_id = p.id;

  if p.id = v_me then
    v_rel := 'self';
  else
    select * into f from public.friendships
    where least(requester_id, addressee_id) = least(v_me, p.id)
      and greatest(requester_id, addressee_id) = greatest(v_me, p.id);
    if found then
      if f.status = 'accepted' then
        v_rel := 'friends';
        v_is_friend := true;
      elsif f.requester_id = v_me then
        v_rel := 'outgoing';
      else
        v_rel := 'incoming';
      end if;
    end if;
  end if;

  v_open := v_rel = 'self' or (v_is_friend and s.profile_visibility = 'friends');

  v_entry := private.visible_latest_entry(p.id, v_me);
  if v_entry is not null then
    select jsonb_build_object(
      'id', e.id, 'mood_value', e.mood_value, 'entry_date', e.entry_date,
      'day_part', e.day_part, 'mood_time', e.mood_time, 'updated_at', e.updated_at
    ) into v_latest
    from public.mood_entries e where e.id = v_entry;
  end if;

  return jsonb_build_object(
    'id', p.id,
    'username', p.username,
    'display_name', p.display_name,
    'avatar_url', p.avatar_url,
    'timezone', case when v_open then p.timezone end,
    'relation', v_rel,
    'friendship_id', f.id,
    'is_private', s.profile_visibility = 'private',
    'can_see_calendar', v_open and (v_rel = 'self' or s.calendar_visibility),
    'can_see_stats', v_open and (v_rel = 'self' or s.statistics_visibility),
    'can_see_notes', v_open and (v_rel = 'self' or s.notes_visibility),
    'can_see_photos', v_open and (v_rel = 'self' or s.photos_visibility),
    'is_muted', exists (select 1 from public.muted_friends m where m.user_id = v_me and m.muted_id = p.id),
    'latest', v_latest
  );
end;
$$;

-- Записи друга за период (поля скрываются согласно приватности)
create or replace function public.get_friend_entries(p_friend uuid, p_from date, p_to date)
returns table (
  id uuid, entry_date date, mood_value smallint, day_part public.day_part,
  mood_time timestamptz, note text, photo_path text, updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  s public.privacy_settings;
begin
  if v_me is null then
    raise exception 'Нужно войти' using errcode = '42501';
  end if;
  if not private.can_see_history(p_friend, v_me) then
    return;
  end if;
  select * into s from public.privacy_settings where user_id = p_friend;

  return query
    select e.id, e.entry_date, e.mood_value, e.day_part, e.mood_time,
           case when p_friend = v_me or s.notes_visibility then e.note end,
           case when p_friend = v_me or s.photos_visibility then e.photo_path end,
           e.updated_at
    from public.mood_entries e
    where e.user_id = p_friend
      and e.entry_date between p_from and p_to
    order by e.entry_date desc
    limit 1000;
end;
$$;

-- Друзья с последним видимым настроением (для главной и списка друзей)
create or replace function public.get_friends()
returns table (
  friendship_id uuid, id uuid, username text, display_name text, avatar_url text,
  since timestamptz, mood_value smallint, entry_date date, day_part public.day_part,
  mood_updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select auth.uid() as uid),
  fr as (
    select f.id as fid, f.accepted_at,
           case when f.requester_id = me.uid then f.addressee_id else f.requester_id end as friend_id
    from public.friendships f, me
    where f.status = 'accepted' and me.uid in (f.requester_id, f.addressee_id)
  )
  select fr.fid, p.id, p.username, p.display_name, p.avatar_url, fr.accepted_at,
         e.mood_value, e.entry_date, e.day_part, e.updated_at
  from fr
  join public.profiles p on p.id = fr.friend_id
  left join public.mood_entries e
    on e.id = private.visible_latest_entry(fr.friend_id, (select uid from me))
  order by e.updated_at desc nulls last, p.display_name;
$$;

-- Лента активности друзей
create or replace function public.get_friends_activity(p_limit int default 30)
returns table (
  entry_id uuid, user_id uuid, username text, display_name text, avatar_url text,
  mood_value smallint, entry_date date, is_update boolean, updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select auth.uid() as uid),
  fr as (
    select case when f.requester_id = me.uid then f.addressee_id else f.requester_id end as friend_id
    from public.friendships f, me
    where f.status = 'accepted' and me.uid in (f.requester_id, f.addressee_id)
  )
  select e.id, p.id, p.username, p.display_name, p.avatar_url, e.mood_value, e.entry_date,
         e.updated_at > e.created_at + interval '1 minute', e.updated_at
  from fr
  join public.profiles p on p.id = fr.friend_id
  join public.mood_entries e on e.user_id = fr.friend_id
  where e.updated_at > now() - interval '14 days'
    and (
      private.can_see_history(fr.friend_id, (select uid from me))
      or e.id = private.visible_latest_entry(fr.friend_id, (select uid from me))
    )
    and exists (
      select 1 from public.privacy_settings s
      where s.user_id = fr.friend_id and s.profile_visibility = 'friends' and s.mood_visibility <> 'none'
    )
  order by e.updated_at desc
  limit least(greatest(p_limit, 1), 100);
$$;

-- Входящие и исходящие заявки
create or replace function public.get_friend_requests()
returns table (
  friendship_id uuid, direction text, id uuid, username text, display_name text,
  avatar_url text, created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select f.id,
         case when f.addressee_id = auth.uid() then 'incoming' else 'outgoing' end,
         p.id, p.username, p.display_name, p.avatar_url, f.created_at
  from public.friendships f
  join public.profiles p
    on p.id = case when f.addressee_id = auth.uid() then f.requester_id else f.addressee_id end
  where f.status = 'pending' and auth.uid() in (f.requester_id, f.addressee_id)
  order by f.created_at desc;
$$;

-- Сохранить push-подписку устройства (endpoint переходит к текущему пользователю)
create or replace function public.save_push_subscription(p_subscription jsonb, p_user_agent text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_endpoint text := p_subscription ->> 'endpoint';
begin
  if v_me is null then
    raise exception 'Нужно войти' using errcode = '42501';
  end if;
  if v_endpoint is null or v_endpoint !~ '^https://' then
    raise exception 'Некорректная подписка' using errcode = '22023';
  end if;
  delete from public.push_subscriptions where endpoint = v_endpoint;
  insert into public.push_subscriptions (user_id, endpoint, subscription, user_agent)
  values (v_me, v_endpoint, p_subscription, left(p_user_agent, 300));
end;
$$;

-- Удалить свой аккаунт (каскадно удаляет все данные; файлы клиент удаляет заранее)
create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'Нужно войти' using errcode = '42501';
  end if;
  delete from auth.users where id = v_me;
end;
$$;

revoke execute on all functions in schema public from public, anon;
grant execute on function public.username_available(text) to anon, authenticated;
grant execute on function public.send_friend_request(uuid) to authenticated;
grant execute on function public.get_user_profile(text) to authenticated;
grant execute on function public.get_friend_entries(uuid, date, date) to authenticated;
grant execute on function public.get_friends() to authenticated;
grant execute on function public.get_friends_activity(int) to authenticated;
grant execute on function public.get_friend_requests() to authenticated;
grant execute on function public.save_push_subscription(jsonb, text) to authenticated;
grant execute on function public.delete_account() to authenticated;

grant usage on schema private to authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
-- Функции private вызываются только из security definer функций и триггеров.

-- =====================================================================
-- Realtime: уведомления приходят мгновенно
-- =====================================================================
alter publication supabase_realtime add table public.notifications;

-- =====================================================================
-- STORAGE
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp']),
  ('mood-photos', 'mood-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Аватары: публичное чтение, запись только в свою папку
create policy "avatars: загрузка в свою папку"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatars: обновление своих"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatars: удаление своих"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatars: чтение своих (для списка файлов)"
  on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Фото настроения: приватные; друзья видят только при разрешении photos_visibility
create or replace function private.can_see_photo(p_object_name text, p_viewer uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (storage.foldername(p_object_name))[1] = p_viewer::text then true
    else exists (
      select 1
      from public.mood_entries e
      join public.privacy_settings s on s.user_id = e.user_id
      where e.photo_path = p_object_name
        and s.photos_visibility
        and private.can_see_history(e.user_id, p_viewer)
    )
  end;
$$;
grant execute on function private.can_see_photo(text, uuid) to authenticated;

create policy "mood-photos: чтение владельцем и разрешёнными друзьями"
  on storage.objects for select to authenticated
  using (bucket_id = 'mood-photos' and private.can_see_photo(name, (select auth.uid())));
create policy "mood-photos: загрузка в свою папку"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'mood-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "mood-photos: обновление своих"
  on storage.objects for update to authenticated
  using (bucket_id = 'mood-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "mood-photos: удаление своих"
  on storage.objects for delete to authenticated
  using (bucket_id = 'mood-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
