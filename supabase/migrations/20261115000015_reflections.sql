-- =====================================================================
-- Рефлексия дня: что порадовало, что разочаровало, инсайты и оценка дня звёздами.
-- Видна только самому пользователю (друзьям и администраторам не показывается).
-- Заодно исправлено: обычный аккаунт с правами администратора мог получить отказ
-- при создании отметки — запрет должен действовать только для служебных аккаунтов.
-- =====================================================================

create table public.day_reflections (
  user_id    uuid not null references auth.users (id) on delete cascade,
  day        date not null,
  good       text check (good is null or char_length(good) <= 1000),
  bad        text check (bad is null or char_length(bad) <= 1000),
  insight    text check (insight is null or char_length(insight) <= 1000),
  rating     smallint check (rating is null or rating between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);
create trigger day_reflections_updated_at
  before update on public.day_reflections
  for each row execute function private.set_updated_at();

alter table public.day_reflections enable row level security;
revoke all on public.day_reflections from anon;
grant select, insert, update, delete on public.day_reflections to authenticated;

create policy "reflections: читать свои"
  on public.day_reflections for select to authenticated using (user_id = (select auth.uid()));
create policy "reflections: создавать свои"
  on public.day_reflections for insert to authenticated
  with check (user_id = (select auth.uid()) and not private.is_blocked((select auth.uid())));
create policy "reflections: менять свои"
  on public.day_reflections for update to authenticated
  using (user_id = (select auth.uid()) and not private.is_blocked((select auth.uid())))
  with check (user_id = (select auth.uid()));
create policy "reflections: удалять свои"
  on public.day_reflections for delete to authenticated using (user_id = (select auth.uid()));

-- Политики вызывают эту функцию от имени пользователя, поэтому ей нужно право на выполнение
grant execute on function private.is_service_admin(uuid) to authenticated;

-- Отметки: служебному аккаунту администратора нельзя, обычному аккаунту с правами — можно
drop policy "mood: создавать свои" on public.mood_entries;
create policy "mood: создавать свои"
  on public.mood_entries for insert to authenticated
  with check (user_id = (select auth.uid()) and not private.is_service_admin((select auth.uid())) and not private.is_blocked((select auth.uid())));
