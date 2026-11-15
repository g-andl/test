-- =====================================================================
-- Администратор — обычный аккаунт с дополнительным разделом «Админ-панель».
--   admins.service = true  — отдельный служебный аккаунт (скрыт в соцсети, дневника нет)
--   admins.service = false — обычный пользователь с правами администратора
-- private.is_admin(...) по-прежнему значит «есть права администратора»;
-- ограничения соцсети (друзья, окно поддержки, статусы) действуют только для служебных аккаунтов.
-- =====================================================================

alter table public.admins add column service boolean not null default true;

create or replace function private.is_service_admin(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins a where a.user_id = p_user and a.service);
$$;
revoke execute on function private.is_service_admin(uuid) from public, anon, authenticated;

-- Пометка «Администратор» в профиле — только у служебных аккаунтов
create or replace function private.sync_admin_flag()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.profiles set is_admin = new.service where id = new.user_id;
    return new;
  else
    update public.profiles set is_admin = false where id = old.user_id;
    return old;
  end if;
end;
$$;

drop policy "friendships: отправить заявку" on public.friendships;
create policy "friendships: отправить заявку"
  on public.friendships for insert to authenticated
  with check (
    requester_id = (select auth.uid()) and status = 'pending'
    and not private.is_service_admin(requester_id) and not private.is_service_admin(addressee_id)
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
  if private.is_blocked(v_me) then
    raise exception 'Аккаунт заблокирован' using errcode = '42501';
  end if;
  if p_addressee = v_me then
    raise exception 'Нельзя добавить себя' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_addressee) then
    raise exception 'Пользователь не найден' using errcode = 'P0002';
  end if;
  if private.is_service_admin(p_addressee) or private.is_service_admin(v_me) then
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

create or replace function private.support_access(p_owner uuid, p_viewer uuid)
returns table (can_view boolean, can_write boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s        public.privacy_settings;
  v_friend boolean;
  v_admin  boolean;
begin
  if p_viewer is null or private.is_blocked(p_viewer) then
    return query select false, false;
    return;
  end if;
  if p_owner = p_viewer then
    return query select true, false;      -- свои сообщения видны, себе не пишут
    return;
  end if;
  if private.is_service_admin(p_viewer) then
    return query select true, false;      -- служебный администратор модерирует, но не пишет
    return;
  end if;
  if private.is_service_admin(p_owner) then
    return query select false, false;
    return;
  end if;
  select * into s from public.privacy_settings where user_id = p_owner;
  v_admin := private.is_admin(p_viewer);
  if not found then
    return query select v_admin, false;
    return;
  end if;
  v_friend := private.are_friends(p_owner, p_viewer);
  return query select
    v_admin or case s.support_view  when 'all' then true when 'friends' then v_friend else false end,
    case s.support_write when 'all' then true when 'friends' then v_friend else false end;
end;
$$;

create or replace function private.refresh_auto_badge(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cur   public.user_badges;
  v_key   text;
  v_badge uuid;
begin
  if private.is_service_admin(p_user) then
    return;
  end if;
  select * into v_cur from public.user_badges where user_id = p_user;
  if found and v_cur.source = 'manual' then
    return;
  end if;
  v_key := private.auto_badge_key(p_user);
  select b.id into v_badge from public.badges b where b.auto_key = v_key;
  if v_badge is null then
    delete from public.user_badges where user_id = p_user and source = 'auto';
    return;
  end if;
  insert into public.user_badges (user_id, badge_id, source) values (p_user, v_badge, 'auto')
  on conflict (user_id) do update
    set badge_id = excluded.badge_id,
        assigned_at = case when public.user_badges.badge_id is distinct from excluded.badge_id then now() else public.user_badges.assigned_at end
    where public.user_badges.source = 'auto';
end;
$$;

-- =====================================================================
-- Назначать и снимать администраторов может только владелец сервиса (admins.owner = true).
-- Остальные администраторы этой кнопки не видят и функцию вызвать не могут.
-- =====================================================================
alter table public.admins add column owner boolean not null default false;

create or replace function private.is_owner(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins a where a.user_id = p_user and a.owner);
$$;
revoke execute on function private.is_owner(uuid) from public, anon, authenticated;

create or replace function public.am_i_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_owner(auth.uid());
$$;
revoke execute on function public.am_i_owner() from public, anon;
grant execute on function public.am_i_owner() to authenticated;

create or replace function public.admin_set_admin(p_user uuid, p_admin boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_owner(auth.uid()) then
    raise exception 'Назначать администраторов может только владелец' using errcode = '42501';
  end if;
  if p_user = auth.uid() then
    raise exception 'Свои права менять нельзя' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'Пользователь не найден' using errcode = 'P0002';
  end if;
  if private.is_service_admin(p_user) then
    raise exception 'Это служебный аккаунт администратора' using errcode = '22023';
  end if;
  if p_admin then
    if private.is_blocked(p_user) then
      raise exception 'Сначала разблокируй аккаунт' using errcode = '22023';
    end if;
    insert into public.admins (user_id, service, owner) values (p_user, false, false) on conflict (user_id) do nothing;
  else
    delete from public.admins where user_id = p_user and not owner;
  end if;
end;
$$;
revoke execute on function public.admin_set_admin(uuid, boolean) from public, anon;
grant execute on function public.admin_set_admin(uuid, boolean) to authenticated;
