-- =====================================================================
-- v2: несколько отметок в день, новая модель приватности,
--     уведомление об отклонённой заявке.
--
-- Приватность теперь такая:
--   * друзья видят всё (настроение, заметки, фото, календарь, статистику);
--   * остальные пользователи — по настройке public_visibility:
--       all    — всё (календарь, статистика, заметки), по умолчанию;
--       latest — только последнюю отметку;
--       none   — ничего (закрытый профиль);
--   * фото для не-друзей скрыто, пока не включено photos_public.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Несколько отметок в день
-- ---------------------------------------------------------------------
alter table public.mood_entries drop constraint if exists mood_entries_user_id_entry_date_key;
create index if not exists mood_entries_user_time_idx on public.mood_entries (user_id, mood_time desc);

-- ---------------------------------------------------------------------
-- 2. Новая модель приватности
-- ---------------------------------------------------------------------
alter table public.privacy_settings
  add column public_visibility text not null default 'all'
    check (public_visibility in ('all', 'latest', 'none')),
  add column photos_public boolean not null default false;

-- Переносим прежние настройки: закрытый профиль или скрытое настроение → none
update public.privacy_settings
set public_visibility = case
      when profile_visibility = 'private' or mood_visibility = 'none' then 'none'
      when not (calendar_visibility or statistics_visibility) then 'latest'
      else 'all'
    end,
    photos_public = false;

-- Старые функции зависят от удаляемых колонок — удаляем их и пересоздаём ниже
drop function if exists public.get_friend_entries(uuid, date, date);
drop function if exists public.get_user_profile(text);
drop function if exists public.get_friends();
drop function if exists public.get_friends_activity(int);
drop function if exists private.can_see_history(uuid, uuid);
drop function if exists private.visible_latest_entry(uuid, uuid);

alter table public.privacy_settings
  drop column profile_visibility,
  drop column mood_visibility,
  drop column calendar_visibility,
  drop column statistics_visibility,
  drop column notes_visibility,
  drop column photos_visibility;

revoke update on public.privacy_settings from authenticated;
grant update (public_visibility, photos_public) on public.privacy_settings to authenticated;

-- Уровень доступа viewer к данным owner: self | friend | all | latest | none
create or replace function private.access_level(p_owner uuid, p_viewer uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_viewer is null then 'none'
    when p_owner = p_viewer then 'self'
    when private.are_friends(p_owner, p_viewer) then 'friend'
    else coalesce((select s.public_visibility from public.privacy_settings s where s.user_id = p_owner), 'none')
  end;
$$;

-- Последняя отметка пользователя (по времени настроения)
create or replace function private.latest_entry_id(p_owner uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select e.id from public.mood_entries e
  where e.user_id = p_owner
  order by e.mood_time desc, e.created_at desc
  limit 1;
$$;

-- Видит ли viewer фото владельца
create or replace function private.photos_allowed(p_owner uuid, p_viewer uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case private.access_level(p_owner, p_viewer)
    when 'self' then true
    when 'friend' then true
    when 'none' then false
    else coalesce((select s.photos_public from public.privacy_settings s where s.user_id = p_owner), false)
  end;
$$;

-- Видна ли конкретная запись viewer'у
create or replace function private.can_see_entry(p_entry uuid, p_viewer uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.mood_entries e
    where e.id = p_entry
      and case private.access_level(e.user_id, p_viewer)
            when 'self' then true
            when 'friend' then true
            when 'all' then true
            when 'latest' then e.id = private.latest_entry_id(e.user_id)
            else false
          end
  );
$$;

-- Фото в хранилище: владелец, друзья, остальные — если разрешено и запись видна
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
      select 1 from public.mood_entries e
      where e.photo_path = p_object_name
        and private.photos_allowed(e.user_id, p_viewer)
        and private.can_see_entry(e.id, p_viewer)
    )
  end;
$$;
grant execute on function private.can_see_photo(text, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Уведомления: отклонённая заявка, друзья видят все отметки
-- ---------------------------------------------------------------------
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'friend_request', 'request_accepted', 'request_declined', 'new_friend',
  'friend_mood', 'friend_mood_updated'));

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
  if not (s.inapp_enabled or s.push_enabled) then
    return;
  end if;
  if p_type in ('friend_request', 'request_accepted', 'request_declined', 'new_friend') and not s.friend_request_enabled then
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

create or replace function private.on_mood_entry_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type   text;
  v_friend uuid;
begin
  if tg_op = 'DELETE' then
    delete from public.notifications where reference_id = old.id;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if new.mood_value = old.mood_value then
      return new;
    end if;
    v_type := 'friend_mood_updated';
  else
    v_type := 'friend_mood';
  end if;

  -- Не шумим о записях задним числом
  if new.entry_date < private.user_today(new.user_id) - 1 then
    return new;
  end if;

  for v_friend in
    select case when f.requester_id = new.user_id then f.addressee_id else f.requester_id end
    from public.friendships f
    where f.status = 'accepted'
      and (f.requester_id = new.user_id or f.addressee_id = new.user_id)
  loop
    -- Одно непрочитанное уведомление на друга в день — заменяем, а не копим
    delete from public.notifications n
    where n.user_id = v_friend
      and n.actor_id = new.user_id
      and n.type in ('friend_mood', 'friend_mood_updated')
      and not n.is_read
      and (n.reference_id = new.id or n.data ->> 'entry_date' = new.entry_date::text);

    perform private.notify(
      v_friend, new.user_id, v_type, new.id,
      jsonb_build_object('mood_value', new.mood_value, 'entry_date', new.entry_date)
    );
  end loop;

  return new;
end;
$$;

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
      delete from public.notifications where reference_id = new.id and type = 'friend_request';
      perform private.notify(new.requester_id, new.addressee_id, 'request_accepted', new.id, '{}'::jsonb);
      perform private.notify(new.addressee_id, new.requester_id, 'new_friend', new.id, '{}'::jsonb);
    end if;
    return new;
  else
    delete from public.notifications where reference_id = old.id;
    -- Получатель отклонил заявку — сообщаем отправителю
    if old.status = 'pending' and auth.uid() = old.addressee_id then
      perform private.notify(old.requester_id, old.addressee_id, 'request_declined', null, '{}'::jsonb);
    end if;
    return old;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. RPC для клиента
-- ---------------------------------------------------------------------

-- Профиль пользователя глазами текущего пользователя
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
  f        public.friendships;
  v_rel    text := 'none';
  v_access text;
  v_photos boolean;
  v_latest jsonb;
  v_count  int;
begin
  if v_me is null then
    raise exception 'Нужно войти' using errcode = '42501';
  end if;

  select * into p from public.profiles where username = lower(p_username);
  if not found then
    return null;
  end if;

  if p.id = v_me then
    v_rel := 'self';
  else
    select * into f from public.friendships
    where least(requester_id, addressee_id) = least(v_me, p.id)
      and greatest(requester_id, addressee_id) = greatest(v_me, p.id);
    if found then
      if f.status = 'accepted' then v_rel := 'friends';
      elsif f.requester_id = v_me then v_rel := 'outgoing';
      else v_rel := 'incoming';
      end if;
    end if;
  end if;

  v_access := private.access_level(p.id, v_me);
  v_photos := private.photos_allowed(p.id, v_me);

  if v_access <> 'none' then
    select jsonb_build_object(
      'id', e.id, 'mood_value', e.mood_value, 'entry_date', e.entry_date,
      'day_part', e.day_part, 'mood_time', e.mood_time, 'updated_at', e.updated_at,
      'note', e.note, 'photo_path', case when v_photos then e.photo_path end
    ) into v_latest
    from public.mood_entries e where e.id = private.latest_entry_id(p.id);

    if v_access in ('self', 'friend', 'all') then
      select count(*) into v_count from public.mood_entries where user_id = p.id;
    end if;
  end if;

  return jsonb_build_object(
    'id', p.id,
    'username', p.username,
    'display_name', p.display_name,
    'avatar_url', p.avatar_url,
    'relation', v_rel,
    'friendship_id', f.id,
    'access', v_access,
    'can_see_history', v_access in ('self', 'friend', 'all'),
    'can_see_photos', v_photos,
    'is_muted', exists (select 1 from public.muted_friends m where m.user_id = v_me and m.muted_id = p.id),
    'entries_count', v_count,
    'latest', v_latest
  );
end;
$$;

-- Записи пользователя за период с учётом доступа
create or replace function public.get_user_entries(p_user uuid, p_from date, p_to date)
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
  v_me     uuid := auth.uid();
  v_access text;
  v_photos boolean;
begin
  if v_me is null then
    raise exception 'Нужно войти' using errcode = '42501';
  end if;
  v_access := private.access_level(p_user, v_me);
  if v_access = 'none' then
    return;
  end if;
  v_photos := private.photos_allowed(p_user, v_me);

  return query
    select e.id, e.entry_date, e.mood_value, e.day_part, e.mood_time, e.note,
           case when v_photos then e.photo_path end, e.updated_at
    from public.mood_entries e
    where e.user_id = p_user
      and e.entry_date between p_from and p_to
      and (v_access <> 'latest' or e.id = private.latest_entry_id(p_user))
    order by e.mood_time desc
    limit 3000;
end;
$$;

-- Друзья с последней отметкой
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
         e.mood_value, e.entry_date, e.day_part, e.mood_time
  from fr
  join public.profiles p on p.id = fr.friend_id
  left join public.mood_entries e on e.id = private.latest_entry_id(fr.friend_id)
  order by e.mood_time desc nulls last, p.display_name;
$$;

-- Лента активности друзей за две недели
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
  order by e.updated_at desc
  limit least(greatest(p_limit, 1), 100);
$$;

revoke execute on function public.get_user_profile(text) from public, anon;
revoke execute on function public.get_user_entries(uuid, date, date) from public, anon;
revoke execute on function public.get_friends() from public, anon;
revoke execute on function public.get_friends_activity(int) from public, anon;
grant execute on function public.get_user_profile(text) to authenticated;
grant execute on function public.get_user_entries(uuid, date, date) to authenticated;
grant execute on function public.get_friends() to authenticated;
grant execute on function public.get_friends_activity(int) to authenticated;

revoke execute on function private.access_level(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.latest_entry_id(uuid) from public, anon, authenticated;
revoke execute on function private.photos_allowed(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.can_see_entry(uuid, uuid) from public, anon, authenticated;
