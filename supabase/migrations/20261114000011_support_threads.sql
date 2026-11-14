-- =====================================================================
-- Окно поддержки как комментарии: ответы на сообщения и на ответы.
--   parent_id   — корневое сообщение ветки (у обычного сообщения null; ветка в один уровень, как во ВК)
--   reply_to_id — сообщение, на которое отвечают (чтобы показать «Имя, ...» и уведомить его автора)
-- Отвечать может владелец окна на любое сообщение, а остальные — если им разрешено писать
-- и они видят окно (или это их собственная ветка: при «видит только я» автор видит свою переписку).
-- =====================================================================

alter table public.support_messages
  add column parent_id   uuid references public.support_messages (id) on delete cascade,
  add column reply_to_id uuid references public.support_messages (id) on delete set null;
create index support_messages_parent_idx on public.support_messages (parent_id, created_at);

-- Владелец отвечает сам себе в своём окне: author = recipient допустим только для ответов
alter table public.support_messages drop constraint support_messages_check;
alter table public.support_messages add constraint support_messages_author_check
  check (recipient_id <> author_id or parent_id is not null);

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'friend_request', 'request_accepted', 'request_declined', 'new_friend',
  'friend_mood', 'friend_mood_updated', 'support_message', 'support_reply'));

-- Статус «Добрая душа» считается по обычным сообщениям, не по ответам
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
  select count(*) into v_msgs from public.support_messages
    where author_id = p_user and created_by_admin is null and parent_id is null;

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

-- Окно поддержки: последние p_limit сообщений со всеми ответами к ним
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
  v_owner boolean;
  v_admin boolean;
  v_msgs  jsonb := '[]'::jsonb;
  v_total int := 0;
begin
  if v_me is null then
    raise exception 'Нужно войти' using errcode = '42501';
  end if;
  select * into a from private.support_access(p_user, v_me);
  v_owner := (v_me = p_user and a.can_view);
  v_admin := private.is_admin(v_me);

  -- Если смотреть окно нельзя, человек всё равно видит свои сообщения и ответы на них
  select count(*) into v_total from public.support_messages sm
  where sm.recipient_id = p_user and sm.parent_id is null
    and (a.can_view or (sm.author_id = v_me and not private.is_blocked(v_me)));

  select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at desc), '[]'::jsonb) into v_msgs
  from (
    with roots as (
      select sm.id from public.support_messages sm
      where sm.recipient_id = p_user and sm.parent_id is null
        and (a.can_view or (sm.author_id = v_me and not private.is_blocked(v_me)))
      order by sm.created_at desc
      limit least(greatest(p_limit, 1), 200)
    )
    select sm.id, sm.body, sm.created_at, sm.author_id,
           p.username as author_username, p.display_name as author_display_name, p.avatar_url as author_avatar_url,
           sm.parent_id, sm.reply_to_id,
           rp.display_name as reply_to_name,
           (sm.author_id = v_me or sm.recipient_id = v_me or v_admin) as can_delete,
           (v_owner or (a.can_write and (a.can_view or coalesce(root.author_id, sm.author_id) = v_me))) as can_reply,
           case when v_admin then sm.created_by_admin is not null end as admin_created,
           case when v_admin then sm.edited_by_admin is not null end as admin_edited
    from public.support_messages sm
    join public.profiles p on p.id = sm.author_id
    left join public.support_messages root on root.id = sm.parent_id
    left join public.support_messages rt on rt.id = sm.reply_to_id
    left join public.profiles rp on rp.id = rt.author_id
    where sm.id in (select id from roots) or sm.parent_id in (select id from roots)
  ) m;

  return jsonb_build_object(
    'can_view', a.can_view, 'can_write', a.can_write, 'total', v_total, 'messages', v_msgs
  );
end;
$$;

-- Написать сообщение (p_parent = null) или ответить на сообщение / ответ (p_parent)
drop function if exists public.post_support_message(uuid, text);
create or replace function public.post_support_message(p_user uuid, p_body text, p_parent uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me     uuid := auth.uid();
  v_body   text := btrim(coalesce(p_body, ''));
  a        record;
  v_id     uuid;
  v_root   uuid;
  v_target public.support_messages;
  v_rootm  public.support_messages;
  v_wall   text;
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
  select username into v_wall from public.profiles where id = p_user;

  if p_parent is null then
    if not a.can_write then
      raise exception 'Автор ограничил, кто может писать ему' using errcode = '42501';
    end if;
    -- Не больше 3 сообщений одному человеку и 15 всего в час (ответы считаются отдельно)
    if (select count(*) from public.support_messages
        where author_id = v_me and recipient_id = p_user and parent_id is null and created_at > now() - interval '1 hour') >= 3
       or (select count(*) from public.support_messages
           where author_id = v_me and parent_id is null and created_at > now() - interval '1 hour') >= 15 then
      raise exception 'Слишком часто. Попробуй чуть позже.' using errcode = '54000';
    end if;
    insert into public.support_messages (recipient_id, author_id, body)
    values (p_user, v_me, v_body)
    returning id into v_id;
    if not exists (select 1 from public.muted_friends m where m.user_id = p_user and m.muted_id = v_me) then
      perform private.notify(p_user, v_me, 'support_message', v_id, jsonb_build_object('wall', v_wall));
    end if;
    return v_id;
  end if;

  -- Ответ
  select * into v_target from public.support_messages where id = p_parent and recipient_id = p_user;
  if not found then
    raise exception 'Сообщение не найдено' using errcode = 'P0002';
  end if;
  v_root := coalesce(v_target.parent_id, v_target.id);
  select * into v_rootm from public.support_messages where id = v_root;

  if not (
    (v_me = p_user and a.can_view)                                                  -- владелец отвечает на любое
    or (a.can_write and (a.can_view or v_rootm.author_id = v_me))                   -- остальные: если разрешено писать
  ) then
    raise exception 'Отвечать здесь нельзя' using errcode = '42501';
  end if;
  if (select count(*) from public.support_messages
      where author_id = v_me and parent_id is not null and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Слишком часто. Попробуй чуть позже.' using errcode = '54000';
  end if;

  insert into public.support_messages (recipient_id, author_id, body, parent_id, reply_to_id)
  values (p_user, v_me, v_body, v_root, v_target.id)
  returning id into v_id;

  -- Владельцу окна (если отвечает не он) и автору сообщения, на которое ответили
  if v_me <> p_user
     and not exists (select 1 from public.muted_friends m where m.user_id = p_user and m.muted_id = v_me) then
    perform private.notify(p_user, v_me, 'support_reply', v_id, jsonb_build_object('wall', v_wall));
  end if;
  if v_target.author_id not in (v_me, p_user)
     and not exists (select 1 from public.muted_friends m where m.user_id = v_target.author_id and m.muted_id = v_me) then
    perform private.notify(v_target.author_id, v_me, 'support_reply', v_id, jsonb_build_object('wall', v_wall));
  end if;
  return v_id;
end;
$$;
revoke execute on function public.post_support_message(uuid, text, uuid) from public, anon;
grant execute on function public.post_support_message(uuid, text, uuid) to authenticated;

-- Удалить: автор, владелец окна или админ. Вместе с сообщением уходят его ответы и их уведомления.
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
  delete from public.notifications
  where type in ('support_message', 'support_reply')
    and reference_id in (select id from public.support_messages where id = p_id or parent_id = p_id);
  delete from public.support_messages where id = p_id;
end;
$$;
