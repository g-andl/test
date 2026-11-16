-- =====================================================================
-- Итоги дня: по умолчанию видны всем, в настройках приватности можно ограничить
-- (только я / друзья / все). Служебный аккаунт администратора итогов не ведёт и не читает.
-- =====================================================================

alter table public.privacy_settings
  add column reflections_visibility text not null default 'all' check (reflections_visibility in ('me', 'friends', 'all'));
grant update (reflections_visibility) on public.privacy_settings to authenticated;

create or replace function private.can_read_reflections(p_owner uuid, p_viewer uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v text;
begin
  if p_viewer is null or private.is_blocked(p_viewer) then
    return false;
  end if;
  if p_owner = p_viewer then
    return true;
  end if;
  if private.is_service_admin(p_owner) or private.is_service_admin(p_viewer) then
    return false;
  end if;
  select s.reflections_visibility into v from public.privacy_settings s where s.user_id = p_owner;
  return case v
    when 'all' then true
    when 'friends' then private.are_friends(p_owner, p_viewer)
    else false
  end;
end;
$$;
revoke execute on function private.can_read_reflections(uuid, uuid) from public, anon;
grant execute on function private.can_read_reflections(uuid, uuid) to authenticated;

drop policy "reflections: читать свои" on public.day_reflections;
create policy "reflections: читать свои и открытые"
  on public.day_reflections for select to authenticated
  using (private.can_read_reflections(user_id, (select auth.uid())));
