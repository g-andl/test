-- =====================================================================
-- Статусы пользователей: цветные пометки рядом с именем («Новичок», «Старейшина», ...).
-- Список статусов и их цвета создаёт администратор; у пользователя не больше одного статуса.
-- Статус публичный, как имя: его видят все вошедшие. Менять может только администратор.
-- У администратора своя встроенная пометка «Администратор» (profiles.is_admin).
-- =====================================================================

create table public.badges (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(btrim(name)) between 1 and 24),
  color      text not null check (color ~* '^#[0-9a-f]{6}$'),
  created_at timestamptz not null default now()
);
create unique index badges_name_uidx on public.badges (lower(btrim(name)));

create table public.user_badges (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  badge_id    uuid not null references public.badges (id) on delete cascade,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references auth.users (id) on delete set null
);
create index user_badges_badge_idx on public.user_badges (badge_id);

alter table public.badges      enable row level security;
alter table public.user_badges enable row level security;
revoke all on public.badges, public.user_badges from anon, authenticated;
grant select on public.badges, public.user_badges to authenticated;
create policy "badges: читать вошедшим" on public.badges for select to authenticated using (true);
create policy "user_badges: читать вошедшим" on public.user_badges for select to authenticated using (true);

insert into public.badges (name, color) values
  ('Новичок',     '#2fb67c'),
  ('Старейшина',  '#d99a1e'),
  ('Активист',    '#4d8df7'),
  ('Добрая душа', '#e0568f')
on conflict do nothing;

-- Создать (p_id = null) или изменить статус
create or replace function public.admin_save_badge(p_id uuid, p_name text, p_color text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform private.require_admin();
  if p_id is null then
    insert into public.badges (name, color) values (btrim(p_name), lower(btrim(p_color))) returning id into v_id;
  else
    update public.badges set name = btrim(p_name), color = lower(btrim(p_color)) where id = p_id returning id into v_id;
    if v_id is null then
      raise exception 'Статус не найден' using errcode = 'P0002';
    end if;
  end if;
  return v_id;
end;
$$;

-- Удалить статус (он снимается у всех, у кого был)
create or replace function public.admin_delete_badge(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  delete from public.badges where id = p_id;
end;
$$;

-- Выдать статус пользователю; p_badge = null — снять
create or replace function public.admin_set_user_badge(p_user uuid, p_badge uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'Пользователь не найден' using errcode = 'P0002';
  end if;
  if p_badge is null then
    delete from public.user_badges where user_id = p_user;
  else
    if not exists (select 1 from public.badges where id = p_badge) then
      raise exception 'Статус не найден' using errcode = 'P0002';
    end if;
    insert into public.user_badges (user_id, badge_id, assigned_by) values (p_user, p_badge, auth.uid())
    on conflict (user_id) do update set badge_id = excluded.badge_id, assigned_at = now(), assigned_by = excluded.assigned_by;
  end if;
end;
$$;

revoke execute on function public.admin_save_badge(uuid, text, text) from public, anon;
revoke execute on function public.admin_delete_badge(uuid) from public, anon;
revoke execute on function public.admin_set_user_badge(uuid, uuid) from public, anon;
grant execute on function public.admin_save_badge(uuid, text, text) to authenticated;
grant execute on function public.admin_delete_badge(uuid) to authenticated;
grant execute on function public.admin_set_user_badge(uuid, uuid) to authenticated;
