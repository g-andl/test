-- =====================================================================
-- «Окно поддержки»: тёплые слова от других пользователей.
-- У каждого пользователя два независимых выбора:
--   support_write — кто может писать:  all (по умолчанию) / friends / none
--   support_view  — кто видит сообщения: all (по умолчанию) / friends / owner
-- Например «писать могут все, видит только я» — личный ящик тёплых слов.
-- Всё проверяется в базе. Доступ к таблице — только через функции ниже.
-- =====================================================================

alter table public.privacy_settings
  add column support_write text not null default 'all' check (support_write in ('all', 'friends', 'none')),
  add column support_view  text not null default 'all' check (support_view in ('all', 'friends', 'owner'));
grant update (support_write, support_view) on public.privacy_settings to authenticated;

create table public.support_messages (
  id           uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  author_id    uuid not null references public.profiles (id) on delete cascade,
  body         text not null check (char_length(btrim(body)) between 1 and 500),
  created_at   timestamptz not null default now(),
  -- Следы действий администратора (виден только админу): кто создал от чужого имени / кто правил
  created_by_admin uuid references auth.users (id) on delete set null,
  edited_by_admin  uuid references auth.users (id) on delete set null,
  edited_at        timestamptz,
  check (recipient_id <> author_id)
);
create index support_messages_recipient_idx on public.support_messages (recipient_id, created_at desc);
create index support_messages_author_idx on public.support_messages (author_id, created_at desc);
alter table public.support_messages enable row level security;
revoke all on public.support_messages from anon, authenticated;

-- Уведомление владельцу о новом сообщении
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'friend_request', 'request_accepted', 'request_declined', 'new_friend',
  'friend_mood', 'friend_mood_updated', 'support_message'));

-- Права viewer на окно поддержки owner
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
begin
  if p_viewer is null or private.is_blocked(p_viewer) then
    return query select false, false;
    return;
  end if;
  if p_owner = p_viewer then
    return query select true, false;      -- свои сообщения видны, себе не пишут
    return;
  end if;
  if private.is_admin(p_viewer) then
    return query select true, false;      -- администратор модерирует, но не пишет
    return;
  end if;
  if private.is_admin(p_owner) then
    return query select false, false;
    return;
  end if;
  select * into s from public.privacy_settings where user_id = p_owner;
  if not found then
    return query select false, false;
    return;
  end if;
  v_friend := private.are_friends(p_owner, p_viewer);
  return query select
    case s.support_view  when 'all' then true when 'friends' then v_friend else false end,
    case s.support_write when 'all' then true when 'friends' then v_friend else false end;
end;
$$;
revoke execute on function private.support_access(uuid, uuid) from public, anon, authenticated;

-- Окно поддержки пользователя: права и сообщения (только если смотреть разрешено)
create or replace function public.get_support_wall(p_user uuid, p_limit int default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me    uuid := auth.uid();
  a       record;
  v_msgs  jsonb := '[]'::jsonb;
  v_total int := 0;
begin
  if v_me is null then
    raise exception 'Нужно войти' using errcode = '42501';
  end if;
  select * into a from private.support_access(p_user, v_me);
  if a.can_view then
    select count(*) into v_total from public.support_messages where recipient_id = p_user;
    select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at desc), '[]'::jsonb) into v_msgs
    from (
      select sm.id, sm.body, sm.created_at, sm.author_id,
             p.username as author_username, p.display_name as author_display_name, p.avatar_url as author_avatar_url,
             (sm.author_id = v_me or sm.recipient_id = v_me or private.is_admin(v_me)) as can_delete,
             case when private.is_admin(v_me) then sm.created_by_admin is not null end as admin_created,
             case when private.is_admin(v_me) then sm.edited_by_admin is not null end as admin_edited
      from public.support_messages sm
      join public.profiles p on p.id = sm.author_id
      where sm.recipient_id = p_user
      order by sm.created_at desc
      limit least(greatest(p_limit, 1), 200)
    ) m;
  end if;
  return jsonb_build_object('can_view', a.can_view, 'can_write', a.can_write, 'total', v_total, 'messages', v_msgs);
end;
$$;

-- Оставить сообщение
create or replace function public.post_support_message(p_user uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me   uuid := auth.uid();
  v_body text := btrim(coalesce(p_body, ''));
  a      record;
  v_id   uuid;
begin
  if v_me is null then
    raise exception 'Нужно войти' using errcode = '42501';
  end if;
  if char_length(v_body) < 1 then
    raise exception 'Напиши сообщение' using errcode = '22023';
  end if;
  if char_length(v_body) > 500 then
    raise exception 'Не длиннее 500 символов' using errcode = '22023';
  end if;
  select * into a from private.support_access(p_user, v_me);
  if not a.can_write then
    raise exception 'Автор ограничил, кто может писать ему' using errcode = '42501';
  end if;
  -- Защита от спама: не больше 3 сообщений одному человеку и 15 всего в час
  if (select count(*) from public.support_messages
      where author_id = v_me and recipient_id = p_user and created_at > now() - interval '1 hour') >= 3
     or (select count(*) from public.support_messages
         where author_id = v_me and created_at > now() - interval '1 hour') >= 15 then
    raise exception 'Слишком часто. Попробуй чуть позже.' using errcode = '54000';
  end if;

  insert into public.support_messages (recipient_id, author_id, body)
  values (p_user, v_me, v_body)
  returning id into v_id;

  -- Тем, чьи уведомления получатель отключил, не сообщаем
  if not exists (select 1 from public.muted_friends m where m.user_id = p_user and m.muted_id = v_me) then
    perform private.notify(p_user, v_me, 'support_message', v_id, '{}'::jsonb);
  end if;
  return v_id;
end;
$$;

-- Удалить сообщение: автор, получатель или администратор
create or replace function public.delete_support_message(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  m    public.support_messages;
begin
  if v_me is null then
    raise exception 'Нужно войти' using errcode = '42501';
  end if;
  select * into m from public.support_messages where id = p_id;
  if not found then
    return;
  end if;
  if v_me not in (m.author_id, m.recipient_id) and not private.is_admin(v_me) then
    raise exception 'Нельзя удалить чужое сообщение' using errcode = '42501';
  end if;
  delete from public.notifications where reference_id = p_id and type = 'support_message';
  delete from public.support_messages where id = p_id;
end;
$$;

revoke execute on function public.get_support_wall(uuid, int) from public, anon;
revoke execute on function public.post_support_message(uuid, text) from public, anon;
revoke execute on function public.delete_support_message(uuid) from public, anon;
grant execute on function public.get_support_wall(uuid, int) to authenticated;
grant execute on function public.post_support_message(uuid, text) to authenticated;
grant execute on function public.delete_support_message(uuid) to authenticated;

-- =====================================================================
-- Администратор: править сообщения и добавлять их от имени пользователя (поддержка).
-- Действия фиксируются в created_by_admin / edited_by_admin.
-- =====================================================================
create or replace function public.admin_edit_support_message(p_id uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_body text := btrim(coalesce(p_body, ''));
begin
  perform private.require_admin();
  if char_length(v_body) < 1 or char_length(v_body) > 500 then
    raise exception 'Текст от 1 до 500 символов' using errcode = '22023';
  end if;
  update public.support_messages
  set body = v_body, edited_by_admin = auth.uid(), edited_at = now()
  where id = p_id;
  if not found then
    raise exception 'Сообщение не найдено' using errcode = 'P0002';
  end if;
end;
$$;

-- Автор — по имени пользователя; лимиты и приватность получателя не применяются
create or replace function public.admin_post_support_message(p_recipient uuid, p_author_username text, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_body   text := btrim(coalesce(p_body, ''));
  v_author uuid;
  v_id     uuid;
begin
  perform private.require_admin();
  if char_length(v_body) < 1 or char_length(v_body) > 500 then
    raise exception 'Текст от 1 до 500 символов' using errcode = '22023';
  end if;
  select p.id into v_author from public.profiles p
  where p.username = lower(btrim(replace(coalesce(p_author_username, ''), '@', '')));
  if v_author is null then
    raise exception 'Автор с таким именем пользователя не найден' using errcode = 'P0002';
  end if;
  if v_author = p_recipient then
    raise exception 'Автор и получатель совпадают' using errcode = '22023';
  end if;
  if private.is_admin(v_author) or private.is_admin(p_recipient) then
    raise exception 'Нельзя использовать аккаунт администратора' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = p_recipient) then
    raise exception 'Получатель не найден' using errcode = 'P0002';
  end if;

  insert into public.support_messages (recipient_id, author_id, body, created_by_admin)
  values (p_recipient, v_author, v_body, auth.uid())
  returning id into v_id;

  if not exists (select 1 from public.muted_friends m where m.user_id = p_recipient and m.muted_id = v_author) then
    perform private.notify(p_recipient, v_author, 'support_message', v_id, '{}'::jsonb);
  end if;
  return v_id;
end;
$$;
revoke execute on function public.admin_edit_support_message(uuid, text) from public, anon;
revoke execute on function public.admin_post_support_message(uuid, text, text) from public, anon;
grant execute on function public.admin_edit_support_message(uuid, text) to authenticated;
grant execute on function public.admin_post_support_message(uuid, text, text) to authenticated;
