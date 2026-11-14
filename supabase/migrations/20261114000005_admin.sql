-- =====================================================================
-- Панель администратора.
-- Администратор — отдельный аккаунт, отмеченный в таблице admins.
-- Каждая функция проверяет права на сервере: обычный пользователь
-- получит ошибку, даже если вызовет функцию напрямую.
-- Пароли пользователей нигде не показываются (хранятся только хеши) —
-- администратор может лишь задать новый пароль.
-- =====================================================================

create table public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;
-- Политик нет: таблица недоступна через API, только через функции ниже

create or replace function private.is_admin(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins a where a.user_id = p_user);
$$;
revoke execute on function private.is_admin(uuid) from public, anon, authenticated;

create or replace function private.require_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin(auth.uid()) then
    raise exception 'Нет прав администратора' using errcode = '42501';
  end if;
end;
$$;
revoke execute on function private.require_admin() from public, anon, authenticated;

-- Является ли текущий пользователь администратором (для интерфейса)
create or replace function public.am_i_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin(auth.uid());
$$;

-- Список аккаунтов
create or replace function public.admin_list_users(p_search text default '', p_limit int default 50, p_offset int default 0)
returns table (
  id uuid, email text, username text, display_name text, avatar_url text,
  created_at timestamptz, last_sign_in_at timestamptz,
  entries_count bigint, friends_count bigint, public_visibility text, is_admin boolean,
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
      select au.id, au.email::text as email, p.username, p.display_name, p.avatar_url,
             au.created_at, au.last_sign_in_at
      from auth.users au
      left join public.profiles p on p.id = au.id
      where v_q = ''
         or lower(au.email) like '%' || v_q || '%'
         or lower(p.username) like '%' || v_q || '%'
         or lower(p.display_name) like '%' || v_q || '%'
    )
    select u.id, u.email, u.username, u.display_name, u.avatar_url, u.created_at, u.last_sign_in_at,
           (select count(*) from public.mood_entries e where e.user_id = u.id),
           (select count(*) from public.friendships f where f.status = 'accepted' and u.id in (f.requester_id, f.addressee_id)),
           (select s.public_visibility from public.privacy_settings s where s.user_id = u.id),
           private.is_admin(u.id),
           count(*) over ()
    from u
    order by u.created_at desc
    limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
end;
$$;

-- Все отметки пользователя
create or replace function public.admin_user_entries(p_user uuid)
returns setof public.mood_entries
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return query select * from public.mood_entries where user_id = p_user order by mood_time desc limit 5000;
end;
$$;

-- Изменить отметку
create or replace function public.admin_update_entry(p_entry uuid, p_mood smallint, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  if p_mood not between 1 and 5 then
    raise exception 'Настроение должно быть от 1 до 5' using errcode = '22023';
  end if;
  update public.mood_entries
  set mood_value = p_mood, note = nullif(btrim(p_note), '')
  where id = p_entry;
end;
$$;

-- Удалить отметку
create or replace function public.admin_delete_entry(p_entry uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  delete from public.mood_entries where id = p_entry;
end;
$$;

-- Задать новый пароль пользователю (старый пароль узнать невозможно)
create or replace function public.admin_set_password(p_user uuid, p_password text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  if char_length(coalesce(p_password, '')) < 8 then
    raise exception 'Пароль должен быть не короче 8 символов' using errcode = '22023';
  end if;
  update auth.users
  set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
      updated_at = now()
  where id = p_user;
  if not found then
    raise exception 'Пользователь не найден' using errcode = 'P0002';
  end if;
end;
$$;

-- Удалить аккаунт пользователя (данные удаляются каскадно; файлы интерфейс удаляет заранее)
create or replace function public.admin_delete_user(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  if p_user = auth.uid() then
    raise exception 'Нельзя удалить свой аккаунт администратора здесь' using errcode = '22023';
  end if;
  if private.is_admin(p_user) then
    raise exception 'Нельзя удалить аккаунт другого администратора' using errcode = '42501';
  end if;
  delete from auth.users where id = p_user;
end;
$$;

revoke execute on function public.am_i_admin() from public, anon;
revoke execute on function public.admin_list_users(text, int, int) from public, anon;
revoke execute on function public.admin_user_entries(uuid) from public, anon;
revoke execute on function public.admin_update_entry(uuid, smallint, text) from public, anon;
revoke execute on function public.admin_delete_entry(uuid) from public, anon;
revoke execute on function public.admin_set_password(uuid, text) from public, anon;
revoke execute on function public.admin_delete_user(uuid) from public, anon;
grant execute on function public.am_i_admin() to authenticated;
grant execute on function public.admin_list_users(text, int, int) to authenticated;
grant execute on function public.admin_user_entries(uuid) to authenticated;
grant execute on function public.admin_update_entry(uuid, smallint, text) to authenticated;
grant execute on function public.admin_delete_entry(uuid) to authenticated;
grant execute on function public.admin_set_password(uuid, text) to authenticated;
grant execute on function public.admin_delete_user(uuid) to authenticated;

-- Администратор видит и удаляет файлы в хранилищах (фото, аватары)
create or replace function private.is_current_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin(auth.uid());
$$;
grant execute on function private.is_current_admin() to authenticated;

create policy "admin: чтение файлов"
  on storage.objects for select to authenticated
  using (bucket_id in ('mood-photos', 'avatars') and private.is_current_admin());
create policy "admin: удаление файлов"
  on storage.objects for delete to authenticated
  using (bucket_id in ('mood-photos', 'avatars') and private.is_current_admin());

-- Администратор виден на сайте с пометкой «Администратор», но в друзья его добавить нельзя.
-- Флаг в профиле меняется только вместе с таблицей admins (пользователи его изменить не могут).
alter table public.profiles add column is_admin boolean not null default false;

create or replace function private.sync_admin_flag()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.profiles set is_admin = true where id = new.user_id;
    return new;
  else
    update public.profiles set is_admin = false where id = old.user_id;
    return old;
  end if;
end;
$$;
create trigger admins_sync_flag
  after insert or delete on public.admins
  for each row execute function private.sync_admin_flag();

-- Нельзя отправить заявку администратору и от его имени
drop policy "friendships: отправить заявку" on public.friendships;
create policy "friendships: отправить заявку"
  on public.friendships for insert to authenticated
  with check (
    requester_id = (select auth.uid()) and status = 'pending'
    and not private.is_admin(requester_id) and not private.is_admin(addressee_id)
  );

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

-- =====================================================================
-- Дата создания аккаунта скрыта от всех пользователей (видит только админ).
-- Доступ к колонкам профиля выдаём поштучно.
-- =====================================================================
revoke select on public.profiles from authenticated;
grant select (id, username, display_name, avatar_url, timezone, onboarded, is_admin) on public.profiles to authenticated;

-- Админ может поправить профиль пользователя
create or replace function public.admin_update_profile(p_user uuid, p_display_name text, p_username text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  update public.profiles
  set display_name = btrim(p_display_name), username = lower(btrim(p_username))
  where id = p_user;
end;
$$;
revoke execute on function public.admin_update_profile(uuid, text, text) from public, anon;
grant execute on function public.admin_update_profile(uuid, text, text) to authenticated;

-- =====================================================================
-- Вход по имени пользователя (регистрация без почты).
-- Аккаунты без почты получают служебный адрес вида u_xxx@users.nastroy.local.
-- Функция отдаёт только служебные адреса — настоящую почту никому не раскрывает.
-- =====================================================================
create or replace function public.login_email(p_username text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select au.email::text
  from public.profiles p
  join auth.users au on au.id = p.id
  where p.username = lower(btrim(p_username))
    and au.email like '%@users.nastroy.local';
$$;
revoke execute on function public.login_email(text) from public;
grant execute on function public.login_email(text) to anon, authenticated;

-- =====================================================================
-- Заявки на восстановление доступа
-- =====================================================================
create table public.recovery_requests (
  id          uuid primary key default gen_random_uuid(),
  username    text not null check (char_length(username) between 1 and 40),
  user_id     uuid references auth.users (id) on delete set null,
  contact     text not null check (char_length(contact) between 3 and 120),
  message     text not null check (char_length(message) between 5 and 2000),
  status      text not null default 'new' check (status in ('new', 'in_progress', 'done')),
  admin_note  text check (admin_note is null or char_length(admin_note) <= 2000),
  ip          text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index recovery_requests_status_idx on public.recovery_requests (status, created_at desc);
alter table public.recovery_requests enable row level security;
revoke all on public.recovery_requests from anon, authenticated;

create trigger recovery_requests_updated_at
  before update on public.recovery_requests
  for each row execute function private.set_updated_at();

-- Отправить заявку может любой, даже без входа; защита от спама — не больше 5 заявок в час с одного адреса
create or replace function public.submit_recovery_request(p_username text, p_contact text, p_message text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ip text;
begin
  begin
    v_ip := split_part(coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1);
  exception when others then
    v_ip := null;
  end;

  if char_length(btrim(coalesce(p_username, ''))) = 0 then
    raise exception 'Укажи имя пользователя' using errcode = '22023';
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

  insert into public.recovery_requests (username, user_id, contact, message, ip)
  values (
    left(lower(btrim(replace(p_username, '@', ''))), 40),
    (select p.id from public.profiles p where p.username = lower(btrim(replace(p_username, '@', '')))),
    left(btrim(p_contact), 120),
    left(btrim(p_message), 2000),
    nullif(v_ip, '')
  );
end;
$$;
revoke execute on function public.submit_recovery_request(text, text, text) from public;
grant execute on function public.submit_recovery_request(text, text, text) to anon, authenticated;

create or replace function public.admin_list_recovery()
returns setof public.recovery_requests
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return query select * from public.recovery_requests
    order by (status = 'done'), created_at desc limit 500;
end;
$$;

create or replace function public.admin_update_recovery(p_id uuid, p_status text, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  update public.recovery_requests
  set status = p_status, admin_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = p_id;
end;
$$;
revoke execute on function public.admin_list_recovery() from public, anon;
revoke execute on function public.admin_update_recovery(uuid, text, text) from public, anon;
grant execute on function public.admin_list_recovery() to authenticated;
grant execute on function public.admin_update_recovery(uuid, text, text) to authenticated;

-- Аккаунт администратора служит только для админки: своих отметок у него нет
drop policy "mood: создавать свои" on public.mood_entries;
create policy "mood: создавать свои"
  on public.mood_entries for insert to authenticated
  with check (user_id = (select auth.uid()) and not private.is_current_admin());

-- Профиль пользователя: добавлен признак администратора
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
    'is_admin', p.is_admin,
    'is_muted', exists (select 1 from public.muted_friends m where m.user_id = v_me and m.muted_id = p.id),
    'entries_count', v_count,
    'latest', v_latest
  );
end;
$$;

