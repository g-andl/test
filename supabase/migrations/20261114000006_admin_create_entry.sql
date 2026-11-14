-- Администратор может поставить отметку за пользователя (поддержка).
-- Друзья получают уведомление как обычно.

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
  if private.is_admin(p_user) then
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
revoke execute on function public.admin_create_entry(uuid, date, timestamptz, public.day_part, smallint, text) from public, anon;
grant execute on function public.admin_create_entry(uuid, date, timestamptz, public.day_part, smallint, text) to authenticated;
