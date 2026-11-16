-- Журнал входов администратора в чужие аккаунты (запись делает Edge Function admin-impersonate).
-- Таблица закрыта для всех ролей API; читает только владелец через функцию ниже.
create table public.admin_impersonations (
  id         uuid primary key default gen_random_uuid(),
  admin_id   uuid not null references auth.users (id) on delete cascade,
  target_id  uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index admin_impersonations_target_idx on public.admin_impersonations (target_id, created_at desc);
alter table public.admin_impersonations enable row level security;
revoke all on public.admin_impersonations from anon, authenticated;

create or replace function public.admin_impersonation_log(p_user uuid)
returns table (created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_owner(auth.uid()) then
    raise exception 'Только для владельца' using errcode = '42501';
  end if;
  return query select i.created_at from public.admin_impersonations i where i.target_id = p_user order by i.created_at desc limit 20;
end;
$$;
revoke execute on function public.admin_impersonation_log(uuid) from public, anon;
grant execute on function public.admin_impersonation_log(uuid) to authenticated;
