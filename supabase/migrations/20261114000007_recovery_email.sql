-- =====================================================================
-- 1. Почта для восстановления: обязательна при регистрации, без подтверждения.
--    Хранится отдельно от входа; видят только сам пользователь и администратор.
-- 2. Запрещённые имена пользователей (admin, support и т.п.) — только для администраторов.
-- 3. Заявка на восстановление принимает имя пользователя ИЛИ почту.
-- =====================================================================

create table public.user_contacts (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  email      text check (email is null or (char_length(email) <= 254 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  updated_at timestamptz not null default now()
);
create index user_contacts_email_idx on public.user_contacts (lower(email));
alter table public.user_contacts enable row level security;
revoke all on public.user_contacts from anon, authenticated;
grant select, update (email) on public.user_contacts to authenticated;
create policy "contacts: свои"
  on public.user_contacts for select to authenticated using (user_id = (select auth.uid()));
create policy "contacts: менять свои"
  on public.user_contacts for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create trigger user_contacts_updated_at
  before update on public.user_contacts
  for each row execute function private.set_updated_at();

-- =====================================================================
-- Блокировка аккаунтов: на срок (blocked_until) или навсегда (blocked_until = null)
-- =====================================================================
create table public.user_blocks (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  blocked_until timestamptz,
  reason        text check (reason is null or char_length(reason) <= 500),
  blocked_at    timestamptz not null default now(),
  blocked_by    uuid references auth.users (id) on delete set null
);
alter table public.user_blocks enable row level security;
revoke all on public.user_blocks from anon, authenticated;

create or replace function private.is_blocked(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_blocks b
    where b.user_id = p_user and (b.blocked_until is null or b.blocked_until > now())
  );
$$;
-- Нужна политикам RLS. Схема private через API не публикуется, вызвать функцию напрямую нельзя.
grant execute on function private.is_blocked(uuid) to authenticated;
grant execute on function private.is_admin(uuid) to authenticated;

-- Переносим настоящие почты прежних аккаунтов
insert into public.user_contacts (user_id, email)
select id, lower(email) from auth.users
where email is not null and email not like '%@users.nastroy.local'
on conflict (user_id) do nothing;

-- Запрещённые имена
create or replace function private.is_reserved_username(p text)
returns boolean
language sql
immutable
as $$
  select lower(p) ~ '(admin|support|moder|nastroy)' or lower(p) in ('root', 'system', 'help');
$$;

create or replace function private.guard_reserved_username()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.is_reserved_username(new.username) and not private.is_admin(new.id) then
    raise exception 'Это имя пользователя занято' using errcode = '23505';
  end if;
  return new;
end;
$$;
create trigger profiles_reserved_username
  before insert or update of username on public.profiles
  for each row execute function private.guard_reserved_username();

create or replace function public.username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select lower(p_username) ~ '^[a-z0-9_]{3,24}$'
     and not private.is_reserved_username(p_username)
     and not exists (select 1 from public.profiles where username = lower(p_username));
$$;

-- Регистрация: создаём контакт из поля contact_email
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
  v_email    text;
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

  v_email := lower(btrim(coalesce(new.raw_user_meta_data ->> 'contact_email', '')));
  if v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    v_email := case when new.email not like '%@users.nastroy.local' then lower(new.email) end;
  end if;
  insert into public.user_contacts (user_id, email) values (new.id, v_email);
  return new;
end;
$$;

-- Заявка: имя пользователя или почта
create or replace function public.submit_recovery_request(p_username text, p_contact text, p_message text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ip    text;
  v_login text := lower(btrim(replace(coalesce(p_username, ''), '@', '')));
  v_raw   text := lower(btrim(coalesce(p_username, '')));
  v_user  uuid;
begin
  begin
    v_ip := split_part(coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1);
  exception when others then
    v_ip := null;
  end;

  if char_length(v_raw) = 0 then
    raise exception 'Укажи имя пользователя или почту' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_contact, ''))) < 3 then
    raise exception 'Укажи Telegram или VK для связи' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_message, ''))) < 5 then
    raise exception 'Опиши ситуацию подробнее' using errcode = '22023';
  end if;
  if v_ip is not null and v_ip <> '' and (
    select count(*) from public.recovery_requests r
    where r.ip = v_ip and r.created_at > now() - interval '1 hour'
  ) >= 5 then
    raise exception 'Слишком много заявок. Попробуй позже.' using errcode = '54000';
  end if;

  -- Почта (есть «@» не в начале) или имя пользователя
  if v_raw ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    select c.user_id into v_user from public.user_contacts c where lower(c.email) = v_raw limit 1;
    if v_user is null then
      select au.id into v_user from auth.users au where lower(au.email) = v_raw limit 1;
    end if;
  else
    select p.id into v_user from public.profiles p where p.username = v_login;
  end if;

  insert into public.recovery_requests (username, user_id, contact, message, ip)
  values (left(v_raw, 40), v_user, left(btrim(p_contact), 120), left(btrim(p_message), 2000), nullif(v_ip, ''));
end;
$$;
alter table public.recovery_requests drop constraint if exists recovery_requests_username_check;
alter table public.recovery_requests alter column username type text;
alter table public.recovery_requests add constraint recovery_requests_username_check check (char_length(username) between 1 and 254);

-- Список аккаунтов: добавлена почта для восстановления
drop function if exists public.admin_list_users(text, int, int);
create or replace function public.admin_list_users(p_search text default '', p_limit int default 50, p_offset int default 0)
returns table (
  id uuid, email text, contact_email text, username text, display_name text, avatar_url text,
  created_at timestamptz, last_sign_in_at timestamptz,
  entries_count bigint, friends_count bigint, public_visibility text, is_admin boolean,
  is_blocked boolean, blocked_until timestamptz, block_reason text,
  total bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q text := lower(btrim(coalesce(p_search, '')));
begin
  perform private.require_admin();
  return query
    with u as (
      select au.id, au.email::text as email, c.email as contact_email, p.username, p.display_name, p.avatar_url,
             au.created_at, au.last_sign_in_at
      from auth.users au
      left join public.profiles p on p.id = au.id
      left join public.user_contacts c on c.user_id = au.id
      where v_q = ''
         or lower(au.email) like '%' || v_q || '%'
         or lower(coalesce(c.email, '')) like '%' || v_q || '%'
         or lower(p.username) like '%' || v_q || '%'
         or lower(p.display_name) like '%' || v_q || '%'
    )
    select u.id, u.email, u.contact_email, u.username, u.display_name, u.avatar_url, u.created_at, u.last_sign_in_at,
           (select count(*) from public.mood_entries e where e.user_id = u.id),
           (select count(*) from public.friendships f where f.status = 'accepted' and u.id in (f.requester_id, f.addressee_id)),
           (select s.public_visibility from public.privacy_settings s where s.user_id = u.id),
           private.is_admin(u.id),
           private.is_blocked(u.id),
           (select b.blocked_until from public.user_blocks b where b.user_id = u.id and private.is_blocked(u.id)),
           (select b.reason from public.user_blocks b where b.user_id = u.id and private.is_blocked(u.id)),
           count(*) over ()
    from u
    order by u.created_at desc
    limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
end;
$$;
revoke execute on function public.admin_list_users(text, int, int) from public, anon;
grant execute on function public.admin_list_users(text, int, int) to authenticated;

-- Админ может поправить почту для восстановления
create or replace function public.admin_set_contact_email(p_user uuid, p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  insert into public.user_contacts (user_id, email) values (p_user, nullif(lower(btrim(p_email)), ''))
  on conflict (user_id) do update set email = excluded.email;
end;
$$;
revoke execute on function public.admin_set_contact_email(uuid, text) from public, anon;
grant execute on function public.admin_set_contact_email(uuid, text) to authenticated;

-- =====================================================================
-- Вход по имени пользователя ИЛИ по почте — для всех аккаунтов.
-- Прежние аккаунты, где почта была логином: почта уже сохранена в user_contacts,
-- логин входа заменяем на служебный адрес. Пароль и сессии не меняются.
-- =====================================================================
-- Резервная копия прежних адресов входа (на случай отката); недоступна через API
create table if not exists private.legacy_auth_emails as
select id as user_id, email, now() as saved_at from auth.users
where email is not null and email not like '%@users.nastroy.local';
revoke all on private.legacy_auth_emails from public, anon, authenticated;

update auth.identities i
set identity_data = jsonb_set(i.identity_data, '{email}', to_jsonb('u_' || replace(i.user_id::text, '-', '') || '@users.nastroy.local')),
    updated_at = now()
from auth.users au
where i.user_id = au.id and i.provider = 'email'
  and au.email not like '%@users.nastroy.local';

update auth.users
set email = 'u_' || replace(id::text, '-', '') || '@users.nastroy.local',
    updated_at = now()
where email not like '%@users.nastroy.local';

create or replace function public.login_email(p_username text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v text := lower(btrim(coalesce(p_username, '')));
begin
  if v ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    -- вход по почте для восстановления
    return (
      select au.email::text from public.user_contacts c
      join auth.users au on au.id = c.user_id
      where lower(c.email) = v and au.email like '%@users.nastroy.local'
      order by au.created_at limit 1
    );
  end if;
  return (
    select au.email::text from public.profiles p
    join auth.users au on au.id = p.id
    where p.username = ltrim(v, '@') and au.email like '%@users.nastroy.local'
  );
end;
$$;
revoke execute on function public.login_email(text) from public;
grant execute on function public.login_email(text) to anon, authenticated;

-- =====================================================================
-- Активность: когда пользователь заходил в приложение.
-- Один «сеанс» — непрерывное использование; перерыв больше 30 минут начинает новый.
-- Видит только администратор.
-- =====================================================================
create table public.user_sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  started_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  user_agent   text check (user_agent is null or char_length(user_agent) <= 300)
);
create index user_sessions_user_idx on public.user_sessions (user_id, started_at desc);
alter table public.user_sessions enable row level security;
revoke all on public.user_sessions from anon, authenticated;

-- Отметка «я в сети»: клиент вызывает при открытии и раз в несколько минут
create or replace function public.touch_activity(p_user_agent text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_id uuid;
begin
  if v_me is null then
    return;
  end if;
  select s.id into v_id from public.user_sessions s
  where s.user_id = v_me and s.last_seen_at > now() - interval '30 minutes'
  order by s.last_seen_at desc limit 1;
  if v_id is not null then
    update public.user_sessions set last_seen_at = now() where id = v_id;
  else
    insert into public.user_sessions (user_id, user_agent) values (v_me, left(p_user_agent, 300));
  end if;
end;
$$;
revoke execute on function public.touch_activity(text) from public, anon;
grant execute on function public.touch_activity(text) to authenticated;

-- p_from/p_to — границы в часовом поясе администратора (клиент передаёт точные моменты)
create or replace function public.admin_user_activity(p_user uuid, p_from timestamptz default null, p_to timestamptz default null)
returns setof public.user_sessions
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return query
    select * from public.user_sessions s
    where s.user_id = p_user
      and (p_from is null or s.last_seen_at >= p_from)
      and (p_to is null or s.started_at < p_to)
    order by s.started_at desc
    limit 1000;
end;
$$;
revoke execute on function public.admin_user_activity(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_user_activity(uuid, timestamptz, timestamptz) to authenticated;

-- Администратор может изменить настройки приватности пользователя
create or replace function public.admin_update_privacy(p_user uuid, p_visibility text, p_photos boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  if p_visibility not in ('all', 'latest', 'none') then
    raise exception 'Недопустимое значение' using errcode = '22023';
  end if;
  update public.privacy_settings
  set public_visibility = p_visibility, photos_public = coalesce(p_photos, false)
  where user_id = p_user;
end;
$$;
revoke execute on function public.admin_update_privacy(uuid, text, boolean) from public, anon;
grant execute on function public.admin_update_privacy(uuid, text, boolean) to authenticated;

-- В списке аккаунтов нужен и флаг «показывать фото»
create or replace function public.admin_user_privacy(p_user uuid)
returns table (public_visibility text, photos_public boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return query select s.public_visibility, s.photos_public from public.privacy_settings s where s.user_id = p_user;
end;
$$;
revoke execute on function public.admin_user_privacy(uuid) from public, anon;
grant execute on function public.admin_user_privacy(uuid) to authenticated;

-- Администратор может удалить заявку на восстановление
create or replace function public.admin_delete_recovery(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  delete from public.recovery_requests where id = p_id;
end;
$$;
revoke execute on function public.admin_delete_recovery(uuid) from public, anon;
grant execute on function public.admin_delete_recovery(uuid) to authenticated;

-- =====================================================================
-- Блокировка: что запрещено заблокированному (проверяется в базе)
-- Войти он может — и сразу видит сообщение о блокировке.
-- =====================================================================

-- Статус блокировки текущего пользователя (доступен и заблокированному)
create or replace function public.my_block_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select jsonb_build_object('blocked', true, 'until', b.blocked_until, 'reason', b.reason)
     from public.user_blocks b
     where b.user_id = auth.uid() and (b.blocked_until is null or b.blocked_until > now())),
    jsonb_build_object('blocked', false)
  );
$$;
revoke execute on function public.my_block_status() from public, anon;
grant execute on function public.my_block_status() to authenticated;

-- Админ: заблокировать (p_until = null — навсегда) и разблокировать
create or replace function public.admin_block_user(p_user uuid, p_until timestamptz, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  if p_user = auth.uid() then
    raise exception 'Нельзя заблокировать себя' using errcode = '22023';
  end if;
  if private.is_admin(p_user) then
    raise exception 'Нельзя заблокировать администратора' using errcode = '42501';
  end if;
  if p_until is not null and p_until <= now() then
    raise exception 'Срок блокировки должен быть в будущем' using errcode = '22023';
  end if;
  insert into public.user_blocks (user_id, blocked_until, reason, blocked_by)
  values (p_user, p_until, nullif(btrim(coalesce(p_reason, '')), ''), auth.uid())
  on conflict (user_id) do update
    set blocked_until = excluded.blocked_until, reason = excluded.reason,
        blocked_at = now(), blocked_by = excluded.blocked_by;
end;
$$;
create or replace function public.admin_unblock_user(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  delete from public.user_blocks where user_id = p_user;
end;
$$;
revoke execute on function public.admin_block_user(uuid, timestamptz, text) from public, anon;
revoke execute on function public.admin_unblock_user(uuid) from public, anon;
grant execute on function public.admin_block_user(uuid, timestamptz, text) to authenticated;
grant execute on function public.admin_unblock_user(uuid) to authenticated;

-- Другие пользователи для заблокированного «пусты»: ни профилей, ни отметок друзей
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
    when private.is_blocked(p_viewer) then 'none'
    when private.are_friends(p_owner, p_viewer) then 'friend'
    else coalesce((select s.public_visibility from public.privacy_settings s where s.user_id = p_owner), 'none')
  end;
$$;

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
      and not private.is_blocked(me.uid)
  )
  select fr.fid, p.id, p.username, p.display_name, p.avatar_url, fr.accepted_at,
         e.mood_value, e.entry_date, e.day_part, e.mood_time
  from fr
  join public.profiles p on p.id = fr.friend_id
  left join public.mood_entries e on e.id = private.latest_entry_id(fr.friend_id)
  order by e.mood_time desc nulls last, p.display_name;
$$;

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
      and not private.is_blocked(me.uid)
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

-- Заявка в друзья: заблокированный отправить не может
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
  if private.is_blocked(v_me) then
    raise exception 'Аккаунт заблокирован' using errcode = '42501';
  end if;
  if p_addressee = v_me then
    raise exception 'Нельзя добавить себя' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_addressee) then
    raise exception 'Пользователь не найден' using errcode = 'P0002';
  end if;
  if private.is_admin(p_addressee) or private.is_admin(v_me) then
    raise exception 'Администратора нельзя добавить в друзья' using errcode = '42501';
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
      update public.friendships set status = 'accepted' where id = f.id;
      return 'friends';
    end if;
  end if;

  insert into public.friendships (requester_id, addressee_id) values (v_me, p_addressee);
  return 'pending';
end;
$$;

-- Политики RLS: заблокированный не пишет и не видит чужое
drop policy if exists "mood: создавать свои" on public.mood_entries;
create policy "mood: создавать свои"
  on public.mood_entries for insert to authenticated
  with check (user_id = (select auth.uid()) and not private.is_current_admin() and not private.is_blocked((select auth.uid())));

drop policy if exists "mood: менять свои" on public.mood_entries;
create policy "mood: менять свои"
  on public.mood_entries for update to authenticated
  using (user_id = (select auth.uid()) and not private.is_blocked((select auth.uid())))
  with check (user_id = (select auth.uid()));

drop policy if exists "friendships: отправить заявку" on public.friendships;
create policy "friendships: отправить заявку"
  on public.friendships for insert to authenticated
  with check (
    requester_id = (select auth.uid()) and status = 'pending'
    and not private.is_admin(requester_id) and not private.is_admin(addressee_id)
    and not private.is_blocked(requester_id)
  );

drop policy if exists "friendships: принять входящую" on public.friendships;
create policy "friendships: принять входящую"
  on public.friendships for update to authenticated
  using (addressee_id = (select auth.uid()) and status = 'pending' and not private.is_blocked((select auth.uid())))
  with check (addressee_id = (select auth.uid()) and status = 'accepted');

drop policy if exists "profiles: читать вошедшим" on public.profiles;
create policy "profiles: читать вошедшим"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or not private.is_blocked((select auth.uid())));

drop policy if exists "profiles: менять свой" on public.profiles;
create policy "profiles: менять свой"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()) and not private.is_blocked((select auth.uid())))
  with check (id = (select auth.uid()));

drop policy if exists "mood-photos: загрузка в свою папку" on storage.objects;
create policy "mood-photos: загрузка в свою папку"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'mood-photos' and (storage.foldername(name))[1] = (select auth.uid())::text
              and not private.is_blocked((select auth.uid())));
drop policy if exists "avatars: загрузка в свою папку" on storage.objects;
create policy "avatars: загрузка в свою папку"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
              and not private.is_blocked((select auth.uid())));
