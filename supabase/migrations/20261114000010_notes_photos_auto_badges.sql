-- =====================================================================
-- 1. Заметки и фото из отметок: для не-друзей по умолчанию видны,
--    пользователь может их скрыть. Друзьям ничего скрыть нельзя.
--    Если фото или заметка есть, но скрыты, зритель узнаёт об этом (has_photo / has_note)
--    и видит пометку «скрыто» вместо пустого места.
-- 2. Автоматические статусы за активность в приложении.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Заметки и фото
-- ---------------------------------------------------------------------
alter table public.privacy_settings
  add column notes_public boolean not null default true;
alter table public.privacy_settings alter column photos_public set default true;
grant update (notes_public) on public.privacy_settings to authenticated;

-- Видит ли viewer заметки владельца
create or replace function private.notes_allowed(p_owner uuid, p_viewer uuid)
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
    else coalesce((select s.notes_public from public.privacy_settings s where s.user_id = p_owner), true)
  end;
$$;
revoke execute on function private.notes_allowed(uuid, uuid) from public, anon, authenticated;

drop function if exists public.get_user_entries(uuid, date, date);
create or replace function public.get_user_entries(p_user uuid, p_from date, p_to date)
returns table (
  id uuid, entry_date date, mood_value smallint, day_part public.day_part,
  mood_time timestamptz, note text, photo_path text, updated_at timestamptz,
  has_note boolean, has_photo boolean
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
  v_notes  boolean;
begin
  if v_me is null then
    raise exception 'Нужно войти' using errcode = '42501';
  end if;
  v_access := private.access_level(p_user, v_me);
  if v_access = 'none' then
    return;
  end if;
  v_photos := private.photos_allowed(p_user, v_me);
  v_notes  := private.notes_allowed(p_user, v_me);

  return query
    select e.id, e.entry_date, e.mood_value, e.day_part, e.mood_time,
           case when v_notes then e.note end,
           case when v_photos then e.photo_path end,
           e.updated_at,
           (e.note is not null and btrim(e.note) <> ''),
           (e.photo_path is not null)
    from public.mood_entries e
    where e.user_id = p_user
      and e.entry_date between p_from and p_to
      and (v_access <> 'latest' or e.id = private.latest_entry_id(p_user))
    order by e.mood_time desc
    limit 3000;
end;
$$;
revoke execute on function public.get_user_entries(uuid, date, date) from public, anon;
grant execute on function public.get_user_entries(uuid, date, date) to authenticated;

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
  v_notes  boolean;
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
  v_notes  := private.notes_allowed(p.id, v_me);

  if v_access <> 'none' then
    select jsonb_build_object(
      'id', e.id, 'mood_value', e.mood_value, 'entry_date', e.entry_date,
      'day_part', e.day_part, 'mood_time', e.mood_time, 'updated_at', e.updated_at,
      'note', case when v_notes then e.note end,
      'photo_path', case when v_photos then e.photo_path end,
      'has_note', (e.note is not null and btrim(e.note) <> ''),
      'has_photo', (e.photo_path is not null)
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
    'can_see_notes', v_notes,
    'is_admin', p.is_admin,
    'is_muted', exists (select 1 from public.muted_friends m where m.user_id = v_me and m.muted_id = p.id),
    'entries_count', v_count,
    'latest', v_latest
  );
end;
$$;
revoke execute on function public.get_user_profile(text) from public, anon;
grant execute on function public.get_user_profile(text) to authenticated;

-- Админ: приватность пользователя вместе с заметками (p_notes = null — не менять)
drop function if exists public.admin_update_privacy(uuid, text, boolean);
create or replace function public.admin_update_privacy(p_user uuid, p_visibility text, p_photos boolean, p_notes boolean default null)
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
  set public_visibility = p_visibility,
      photos_public = coalesce(p_photos, false),
      notes_public = coalesce(p_notes, notes_public)
  where user_id = p_user;
end;
$$;
revoke execute on function public.admin_update_privacy(uuid, text, boolean, boolean) from public, anon;
grant execute on function public.admin_update_privacy(uuid, text, boolean, boolean) to authenticated;

drop function if exists public.admin_user_privacy(uuid);
create or replace function public.admin_user_privacy(p_user uuid)
returns table (public_visibility text, photos_public boolean, notes_public boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return query select s.public_visibility, s.photos_public, s.notes_public from public.privacy_settings s where s.user_id = p_user;
end;
$$;
revoke execute on function public.admin_user_privacy(uuid) from public, anon;
grant execute on function public.admin_user_privacy(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 2. Автоматические статусы
--    У статуса есть ключ auto_key и подсказка hint. Вручную выданный статус система не трогает.
-- ---------------------------------------------------------------------
alter table public.badges
  add column auto_key text unique,
  add column hint text check (hint is null or char_length(hint) <= 120);
alter table public.user_badges
  add column source text not null default 'manual' check (source in ('manual', 'auto'));

update public.badges set auto_key = 'newbie',    hint = 'Первые две недели в приложении'                where name = 'Новичок'     and auto_key is null;
update public.badges set auto_key = 'elder',     hint = 'С нами больше полугода и 30+ отметок'          where name = 'Старейшина'  and auto_key is null;
update public.badges set auto_key = 'activist',  hint = '10 и больше отметок за последние 30 дней'      where name = 'Активист'    and auto_key is null;
update public.badges set auto_key = 'kind',      hint = '10 и больше тёплых слов в окне поддержки'      where name = 'Добрая душа' and auto_key is null;

insert into public.badges (name, color, auto_key, hint) values
  ('Огонёк',        '#f08a3c', 'spark',      'Отмечает настроение 7 дней подряд'),
  ('Стойкий',       '#e5605f', 'steadfast',  'Серия отметок 30 дней подряд'),
  ('Летописец',     '#8b7cf6', 'chronicler', '100 и больше отметок в дневнике'),
  ('Душа компании', '#36b5c9', 'social',     'Пять и больше друзей'),
  ('Свой человек',  '#6b7383', 'regular',    'С нами больше месяца и 5+ отметок')
on conflict do nothing;

-- Какой статус положен пользователю по активности (первый подходящий)
create or replace function private.auto_badge_key(p_user uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_created timestamptz;
  v_days    int;
  v_entries int;
  v_recent  int;
  v_friends int;
  v_msgs    int;
  v_streak  int := 0;
  v_today   date;
  v_last    date;
begin
  select au.created_at into v_created from auth.users au where au.id = p_user;
  if v_created is null then
    return null;
  end if;
  v_days  := floor(extract(epoch from (now() - v_created)) / 86400);
  v_today := private.user_today(p_user);

  select count(*) into v_entries from public.mood_entries where user_id = p_user;
  select count(*) into v_recent  from public.mood_entries where user_id = p_user and entry_date > v_today - 30;
  select count(*) into v_friends from public.friendships f
    where f.status = 'accepted' and p_user in (f.requester_id, f.addressee_id);
  select count(*) into v_msgs from public.support_messages where author_id = p_user and created_by_admin is null;

  -- Серия: подряд идущие дни с отметкой, заканчивающиеся сегодня или вчера
  select max(entry_date) into v_last from public.mood_entries where user_id = p_user and entry_date <= v_today;
  if v_last is not null and v_last >= v_today - 1 then
    select count(*) into v_streak from (
      select q.d + (row_number() over (order by q.d desc))::int as g
      from (select distinct entry_date as d from public.mood_entries where user_id = p_user and entry_date <= v_today) q
    ) r
    where r.g = v_last + 1;
  end if;

  if v_days >= 180 and v_entries >= 30 then return 'elder'; end if;
  if v_streak >= 30 then return 'steadfast'; end if;
  if v_entries >= 100 then return 'chronicler'; end if;
  if v_friends >= 5 then return 'social'; end if;
  if v_msgs >= 10 then return 'kind'; end if;
  if v_streak >= 7 then return 'spark'; end if;
  if v_recent >= 10 then return 'activist'; end if;
  if v_days >= 30 and v_entries >= 5 then return 'regular'; end if;
  if v_days < 14 then return 'newbie'; end if;
  return null;
end;
$$;
revoke execute on function private.auto_badge_key(uuid) from public, anon, authenticated;

-- Пересчитать статус одного пользователя. Вручную выданный не затрагивается.
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
  if private.is_admin(p_user) then
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
revoke execute on function private.refresh_auto_badge(uuid) from public, anon, authenticated;

create or replace function private.refresh_all_auto_badges()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  n int := 0;
begin
  for r in select id from public.profiles loop
    perform private.refresh_auto_badge(r.id);
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke execute on function private.refresh_all_auto_badges() from public, anon, authenticated;

-- Админ: пересчитать у всех
create or replace function public.admin_refresh_badges()
returns int
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return private.refresh_all_auto_badges();
end;
$$;
revoke execute on function public.admin_refresh_badges() from public, anon;
grant execute on function public.admin_refresh_badges() to authenticated;

-- Выдача вручную: помечаем source = manual; снять — вернуть автоматический статус
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
    perform private.refresh_auto_badge(p_user);
  else
    if not exists (select 1 from public.badges where id = p_badge) then
      raise exception 'Статус не найден' using errcode = 'P0002';
    end if;
    insert into public.user_badges (user_id, badge_id, assigned_by, source) values (p_user, p_badge, auth.uid(), 'manual')
    on conflict (user_id) do update
      set badge_id = excluded.badge_id, assigned_at = now(), assigned_by = excluded.assigned_by, source = 'manual';
  end if;
end;
$$;

-- Встроенные (автоматические) статусы удалять нельзя — можно менять название и цвет
create or replace function public.admin_delete_badge(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  if exists (select 1 from public.badges where id = p_id and auto_key is not null) then
    raise exception 'Автоматический статус удалить нельзя — измени название или цвет' using errcode = '42501';
  end if;
  delete from public.badges where id = p_id;
end;
$$;

-- Статус пересчитывается при каждом заходе пользователя в приложение
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
  begin
    perform private.refresh_auto_badge(v_me);
  exception when others then
    null;  -- пересчёт статуса не должен мешать входу
  end;
end;
$$;

-- Раз в сутки пересчитываем всех (если на сервере есть pg_cron), чтобы статусы
-- уходили и у тех, кто давно не заходит (например, «Новичок» через две недели)
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('refresh-auto-badges', '15 3 * * *', 'select private.refresh_all_auto_badges()');
exception when others then
  raise notice 'pg_cron недоступен (%), статусы пересчитываются при заходе пользователей и кнопкой в админке', sqlerrm;
end $$;

-- Первый расчёт для уже существующих пользователей
select private.refresh_all_auto_badges();
