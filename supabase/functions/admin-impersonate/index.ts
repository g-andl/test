// Edge Function «admin-impersonate»: вход в аккаунт пользователя из админ-панели без пароля.
// Доступна только владельцу сервиса (admins.owner = true). Другого администратора и служебный
// аккаунт открыть нельзя. Каждый вход записывается в admin_impersonations.
// Возвращает одноразовый токен; браузер обменивает его на сессию пользователя (verifyOtp).
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const svcHeaders = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Метод не поддерживается" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Нужно войти" }, 401);

  // Кто вызывает: проверяем токен вызывающего
  const who = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: ANON_KEY, Authorization: authHeader } });
  if (!who.ok) return json({ error: "Нужно войти" }, 401);
  const me = (await who.json()) as { id?: string };
  if (!me.id) return json({ error: "Нужно войти" }, 401);

  const rest = async (path: string) => (await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: svcHeaders })).json();

  const owners = (await rest(`admins?select=owner&user_id=eq.${me.id}`)) as { owner: boolean }[];
  if (!owners[0]?.owner) return json({ error: "Войти в чужой аккаунт может только владелец" }, 403);

  let target: string | undefined;
  try {
    target = (await req.json())?.user_id;
  } catch {
    return json({ error: "Некорректный запрос" }, 400);
  }
  if (!target || typeof target !== "string" || !/^[0-9a-f-]{36}$/i.test(target)) return json({ error: "Не указан пользователь" }, 400);
  if (target === me.id) return json({ error: "Это твой аккаунт" }, 400);

  // Администраторов и служебные аккаунты открывать нельзя
  const targetAdmin = (await rest(`admins?select=user_id&user_id=eq.${target}`)) as unknown[];
  if (targetAdmin.length) return json({ error: "В аккаунт администратора войти нельзя" }, 403);

  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${target}`, { headers: svcHeaders });
  const targetUser = userRes.ok ? ((await userRes.json()) as { email?: string }) : null;
  if (!targetUser?.email) return json({ error: "Пользователь не найден" }, 404);

  const linkRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: svcHeaders,
    body: JSON.stringify({ type: "magiclink", email: targetUser.email }),
  });
  const link = linkRes.ok ? ((await linkRes.json()) as { hashed_token?: string; properties?: { hashed_token?: string } }) : null;
  const tokenHash = link?.hashed_token ?? link?.properties?.hashed_token;
  if (!tokenHash) return json({ error: "Не удалось создать вход" }, 500);

  await fetch(`${SUPABASE_URL}/rest/v1/admin_impersonations`, {
    method: "POST",
    headers: { ...svcHeaders, Prefer: "return=minimal" },
    body: JSON.stringify({ admin_id: me.id, target_id: target }),
  });
  return json({ token_hash: tokenHash });
});
