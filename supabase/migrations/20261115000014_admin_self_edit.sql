-- Администратор с обычным аккаунтом — такой же пользователь: в админ-панели ему можно
-- ставить отметки и оставлять сообщения в окне поддержки. Запрет остаётся только для служебных аккаунтов.

create or replace function public.admin_create_entry(
  p_user uuid, p_date date, p_time timestamptz, p_part public.day_part, p_mood smallint, p_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform private.require_admin();
  if private.is_service_admin(p_user) then
    raise exception 'У администратора нет дневника' using errcode = '22023';
  end if;
  if p_mood not between 1 and 5 then
    raise exception 'Настроение должно быть от 1 до 5' using errcode = '22023';
  end if;
  insert into public.mood_entries (user_id, entry_date, mood_value, note, mood_time, day_part)
  values (p_user, p_date, p_mood, nullif(btrim(p_note), ''), p_time, p_part)
  returning id into v_id;
  return v_id;
end;
$$;

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
  if private.is_service_admin(v_author) or private.is_service_admin(p_recipient) then
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
