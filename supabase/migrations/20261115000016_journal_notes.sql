-- =====================================================================
-- Заметки в дневнике: свободные записи без ограничения «как в отметке».
-- По умолчанию видны только автору; в настройках приватности можно открыть друзьям или всем.
-- Администратор заметки не читает.
-- =====================================================================

alter table public.privacy_settings
  add column journal_visibility text not null default 'me' check (journal_visibility in ('me', 'friends', 'all'));
grant update (journal_visibility) on public.privacy_settings to authenticated;

-- Группы заметок: «Личное», «Отношения» и любые свои
create table public.journal_groups (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null check (char_length(btrim(name)) between 1 and 40),
  created_at timestamptz not null default now()
);
create unique index journal_groups_name_idx on public.journal_groups (user_id, lower(btrim(name)));

create table public.journal_notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  group_id   uuid references public.journal_groups (id) on delete set null,
  title      text check (title is null or char_length(title) <= 120),
  body       text not null check (char_length(body) between 1 and 100000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index journal_notes_user_idx on public.journal_notes (user_id, created_at desc);
create trigger journal_notes_updated_at
  before update on public.journal_notes
  for each row execute function private.set_updated_at();

create or replace function private.can_read_journal(p_owner uuid, p_viewer uuid)
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
  select s.journal_visibility into v from public.privacy_settings s where s.user_id = p_owner;
  return case v
    when 'all' then true
    when 'friends' then private.are_friends(p_owner, p_viewer)
    else false
  end;
end;
$$;
revoke execute on function private.can_read_journal(uuid, uuid) from public, anon;
grant execute on function private.can_read_journal(uuid, uuid) to authenticated;

alter table public.journal_notes enable row level security;
alter table public.journal_groups enable row level security;
revoke all on public.journal_notes, public.journal_groups from anon;
grant select, insert, update, delete on public.journal_notes, public.journal_groups to authenticated;

-- Группа должна принадлежать тому же пользователю
create or replace function private.owns_journal_group(p_group uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_group is null or exists (select 1 from public.journal_groups g where g.id = p_group and g.user_id = p_user);
$$;
revoke execute on function private.owns_journal_group(uuid, uuid) from public, anon;
grant execute on function private.owns_journal_group(uuid, uuid) to authenticated;

create policy "journal groups: читать свои и открытые"
  on public.journal_groups for select to authenticated
  using (private.can_read_journal(user_id, (select auth.uid())));
create policy "journal groups: создавать свои"
  on public.journal_groups for insert to authenticated
  with check (user_id = (select auth.uid()) and not private.is_service_admin((select auth.uid())) and not private.is_blocked((select auth.uid())));
create policy "journal groups: менять свои"
  on public.journal_groups for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "journal groups: удалять свои"
  on public.journal_groups for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "journal: читать свои и открытые"
  on public.journal_notes for select to authenticated
  using (private.can_read_journal(user_id, (select auth.uid())));
create policy "journal: создавать свои"
  on public.journal_notes for insert to authenticated
  with check (user_id = (select auth.uid()) and not private.is_service_admin((select auth.uid())) and not private.is_blocked((select auth.uid())) and private.owns_journal_group(group_id, user_id));
create policy "journal: менять свои"
  on public.journal_notes for update to authenticated
  using (user_id = (select auth.uid()) and not private.is_blocked((select auth.uid())))
  with check (user_id = (select auth.uid()) and private.owns_journal_group(group_id, user_id));
create policy "journal: удалять свои"
  on public.journal_notes for delete to authenticated
  using (user_id = (select auth.uid()));
