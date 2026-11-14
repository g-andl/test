-- Окно поддержки: убраны лимиты «3 сообщения одному человеку в час», «15 в час» и «30 ответов в час».
-- Остался один очень высокий предохранитель от автоматической рассылки: 100 сообщений и ответов
-- в час от одного автора. Обычный человек его не заметит. Защита владельца окна — в его настройках
-- («кто может писать»), удаление сообщений и блокировка администратором.

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
  -- Предохранитель от скриптов
  if (select count(*) from public.support_messages
      where author_id = v_me and created_at > now() - interval '1 hour') >= 100 then
    raise exception 'Слишком много сообщений подряд. Попробуй чуть позже.' using errcode = '54000';
  end if;
  select * into a from private.support_access(p_user, v_me);
  select username into v_wall from public.profiles where id = p_user;

  if p_parent is null then
    if not a.can_write then
      raise exception 'Автор ограничил, кто может писать ему' using errcode = '42501';
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
    (v_me = p_user and a.can_view)
    or (a.can_write and (a.can_view or v_rootm.author_id = v_me))
  ) then
    raise exception 'Отвечать здесь нельзя' using errcode = '42501';
  end if;

  insert into public.support_messages (recipient_id, author_id, body, parent_id, reply_to_id)
  values (p_user, v_me, v_body, v_root, v_target.id)
  returning id into v_id;

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
