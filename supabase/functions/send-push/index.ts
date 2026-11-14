// Edge Function «send-push»: отправляет Web Push по новому уведомлению.
// Вызывается триггером базы (pg_net) с общим секретом в заголовке x-push-secret.
// Тексты не содержат заметок и фото — только имя друга и настроение.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.119.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("PUSH_WEBHOOK_SECRET") ?? "";
const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com";
// Адрес приложения, например https://g-andl.github.io/test
const APP_URL = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "");

const MOODS: Record<number, { label: string; feel: string; emoji: string }> = {
  5: { label: "Отлично", feel: "отлично", emoji: "😄" },
  4: { label: "Хорошо", feel: "хорошо", emoji: "🙂" },
  3: { label: "Нейтрально", feel: "нейтрально", emoji: "😐" },
  2: { label: "Грустно", feel: "немного грустно", emoji: "😔" },
  1: { label: "Плохо", feel: "плохо", emoji: "😣" },
};

function message(type: string, name: string, mood?: number) {
  const m = mood ? MOODS[mood] : undefined;
  switch (type) {
    case "friend_request":
      return { title: "Новая заявка в друзья", body: `${name} хочет добавить тебя в друзья` };
    case "request_accepted":
      return { title: "Заявка принята", body: `${name} теперь в твоих друзьях` };
    case "request_declined":
      return { title: "Заявка отклонена", body: `${name} отклонил(а) твою заявку в друзья` };
    case "new_friend":
      return { title: "Новый друг", body: `${name} теперь в твоих друзьях` };
    case "friend_mood":
      return m && mood! <= 2
        ? { title: `${name} ${m.emoji}`, body: `${name} сегодня чувствует себя ${m.feel}` }
        : { title: `${name} ${m?.emoji ?? ""}`.trim(), body: `${name} отметил(а) настроение: ${m?.label ?? ""}` };
    case "friend_mood_updated":
      return { title: `${name} ${m?.emoji ?? ""}`.trim(), body: `${name} обновил(а) своё настроение${m ? `: ${m.label}` : ""}` };
    default:
      return { title: "Настрой", body: "У тебя новое уведомление" };
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!WEBHOOK_SECRET || req.headers.get("x-push-secret") !== WEBHOOK_SECRET) {
    return new Response("Forbidden", { status: 403 });
  }
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return new Response("VAPID keys are not configured", { status: 500 });
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

  let notificationId: string | undefined;
  try {
    notificationId = (await req.json()).notification_id;
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  if (!notificationId) return new Response("Bad request", { status: 400 });

  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const { data: n } = await db
    .from("notifications")
    .select("id, user_id, type, data, actor:profiles!notifications_actor_id_fkey(username, display_name)")
    .eq("id", notificationId)
    .maybeSingle();
  if (!n) return new Response("Not found", { status: 404 });

  const { data: settings } = await db.from("notification_settings").select("push_enabled").eq("user_id", n.user_id).maybeSingle();
  if (!settings?.push_enabled) return Response.json({ sent: 0, reason: "push disabled" });

  const { data: subs } = await db.from("push_subscriptions").select("id, subscription").eq("user_id", n.user_id).eq("platform", "web");
  if (!subs?.length) return Response.json({ sent: 0 });

  const { count: unread } = await db
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", n.user_id)
    .eq("is_read", false);

  const actor = n.actor as unknown as { username: string; display_name: string } | null;
  const name = actor?.display_name ?? "Друг";
  const { title, body } = message(n.type, name, (n.data as { mood_value?: number })?.mood_value);
  const path = n.type === "friend_request" ? "/friends/" : actor ? `/user/?u=${actor.username}` : "/notifications/";
  const payload = JSON.stringify({ title, body, url: `${APP_URL}${path}`, tag: `${n.type}-${actor?.username ?? ""}`, unread: unread ?? 0 });

  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(s.subscription, payload, { TTL: 60 * 60 * 12, urgency: "normal" });
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        // Подписка больше не действует — удаляем
        if (code === 404 || code === 410) await db.from("push_subscriptions").delete().eq("id", s.id);
        else console.error("push error", code, (e as Error).message);
      }
    }),
  );
  return Response.json({ sent });
});
