-- Каждая отметка настроения даёт другу отдельное уведомление.
-- Раньше непрочитанные уведомления за день схлопывались в одно — из-за этого
-- у друга «пропадали» предыдущие отметки.

create or replace function private.on_mood_entry_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type   text;
  v_friend uuid;
begin
  if tg_op = 'DELETE' then
    delete from public.notifications where reference_id = old.id;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if new.mood_value = old.mood_value then
      return new;
    end if;
    v_type := 'friend_mood_updated';
  else
    v_type := 'friend_mood';
  end if;

  -- Не шумим о записях задним числом
  if new.entry_date < private.user_today(new.user_id) - 1 then
    return new;
  end if;

  for v_friend in
    select case when f.requester_id = new.user_id then f.addressee_id else f.requester_id end
    from public.friendships f
    where f.status = 'accepted'
      and (f.requester_id = new.user_id or f.addressee_id = new.user_id)
  loop
    -- Каждая отметка — отдельное уведомление. Заменяем только непрочитанное
    -- уведомление об этой же самой отметке (если её отредактировали)
    delete from public.notifications n
    where n.user_id = v_friend
      and n.reference_id = new.id
      and not n.is_read;

    perform private.notify(
      v_friend, new.user_id, v_type, new.id,
      jsonb_build_object('mood_value', new.mood_value, 'entry_date', new.entry_date)
    );
  end loop;

  return new;
end;
$$;

