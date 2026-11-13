-- =====================================================================
-- Push-уведомления: при новом уведомлении вызываем Edge Function send-push.
-- URL функции и общий секрет хранятся в Supabase Vault:
--   select vault.create_secret('https://<project>.supabase.co/functions/v1/send-push', 'push_function_url');
--   select vault.create_secret('<случайная строка>', 'push_webhook_secret');
-- Пока секреты не заданы, триггер ничего не делает (внутренние уведомления работают).
-- =====================================================================

create extension if not exists pg_net with schema extensions;

create or replace function private.dispatch_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url    text;
  v_secret text;
begin
  -- Push включён у получателя и есть хотя бы одна подписка
  if not exists (
    select 1 from public.notification_settings s
    where s.user_id = new.user_id and s.push_enabled
  ) or not exists (
    select 1 from public.push_subscriptions p where p.user_id = new.user_id
  ) then
    return new;
  end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'push_function_url' limit 1;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_webhook_secret' limit 1;
  if v_url is null or v_secret is null then
    return new;
  end if;

  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('notification_id', new.id),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-secret', v_secret
    ),
    timeout_milliseconds := 5000
  );
  return new;
exception when others then
  -- Сбой push не должен ломать сохранение настроения
  raise warning 'dispatch_push: %', sqlerrm;
  return new;
end;
$$;

create trigger notifications_dispatch_push
  after insert on public.notifications
  for each row execute function private.dispatch_push();
