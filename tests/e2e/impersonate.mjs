// Вход владельца в чужой аккаунт без пароля и возврат в админ-панель.
// Запуск: npx supabase functions serve --env-file supabase/functions/.env  (в другом терминале)
//         node tests/e2e/impersonate.mjs  (нужны локальный Supabase и сайт на :3000)
import { chromium } from "playwright";
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.E2E_URL || "http://localhost:3000";
const SHOTS = process.env.SHOTS_DIR || "test-results/screens";
mkdirSync(SHOTS, { recursive: true });
const env = Object.fromEntries(
  execSync("npx supabase status -o env", { encoding: "utf8" }).split("\n").filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")]),
);
const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const run = Date.now().toString(36).slice(-6);
const log = (...a) => console.log("•", ...a);

const mk = async (username, name) => {
  const { data, error } = await admin.auth.admin.createUser({
    email: `u_${username}@users.nastroy.local`, password: "Passw0rd!x", email_confirm: true,
    user_metadata: { username, display_name: name },
  });
  if (error) throw error;
  await admin.from("profiles").update({ onboarded: true }).eq("id", data.user.id);
  return data.user.id;
};
const ownerId = await mk(`own_${run}`, "Владелец");
await admin.from("admins").insert({ user_id: ownerId, service: false, owner: true });
const secondId = await mk(`sec_${run}`, "Второй админ");
await admin.from("admins").insert({ user_id: secondId, service: false });
const userId = await mk(`vic_${run}`, "Пользователь Ввв");
await admin.from("mood_entries").insert({ user_id: userId, entry_date: "2026-11-14", mood_value: 4, note: "заметка Ввв", mood_time: new Date().toISOString(), day_part: "day" });

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const errors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: "ru-RU", isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto(`${BASE}/login/`);
  await page.getByLabel("Имя пользователя или почта").fill(`own_${run}`);
  await page.getByLabel("Пароль", { exact: true }).fill("Passw0rd!x");
  await page.getByRole("button", { name: "Войти" }).click();
  // Владелец — обычный аккаунт: попадает на главную, админ-панель в профиле
  await page.waitForURL((u) => !/login/.test(u.pathname), { timeout: 15000 });
  await page.goto(`${BASE}/admin/`);
  await page.getByRole("heading", { name: "Админ-панель" }).waitFor();
  await page.getByLabel("Поиск пользователей").fill(`vic_${run}`);
  await page.getByRole("button", { name: new RegExp(`@vic_${run}`) }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("button", { name: "Войти в аккаунт" }).click();
  await page.waitForURL((u) => !/admin/.test(u.pathname), { timeout: 20000 });
  // Мы в аккаунте пользователя: видим его приветствие и боковую вкладку возврата
  await page.getByText("Привет, Пользователь!").first().waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: /Вернуться в админ-панель/ }).waitFor();
  await page.screenshot({ path: `${SHOTS}/i1-as-user.png` });
  log("владелец вошёл в аккаунт пользователя без пароля");
  const { data: lg } = await admin.from("admin_impersonations").select("admin_id, target_id").eq("target_id", userId);
  assert.equal(lg.length, 1);
  assert.equal(lg[0].admin_id, ownerId);
  log("вход записан в журнал");
  // Заходы в чужом аккаунте пользователю не засчитываются
  await page.waitForTimeout(1500);
  const { data: sess } = await admin.from("user_sessions").select("id").eq("user_id", userId);
  assert.equal(sess.length, 0, "активность пользователя не изменилась");
  log("активность пользователя не засчитана");

  await page.getByRole("button", { name: /Вернуться в админ-панель/ }).click();
  await page.waitForURL(/\/admin\//, { timeout: 15000 });
  await page.getByRole("heading", { name: "Админ-панель" }).waitFor();
  await page.getByRole("button", { name: /Вернуться в админ-панель/ }).waitFor({ state: "detached" });
  log("возврат в админ-панель работает");

  // Второй администратор и обычный пользователь так войти не могут
  const mkClient = async (username) => {
    const c = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
    const { error } = await c.auth.signInWithPassword({ email: `u_${username}@users.nastroy.local`, password: "Passw0rd!x" });
    assert.ok(!error, error?.message);
    return c;
  };
  const second = await mkClient(`sec_${run}`);
  const denied = await second.functions.invoke("admin-impersonate", { body: { user_id: userId } });
  assert.ok(denied.error, "второй администратор войти не может");
  const owner = await mkClient(`own_${run}`);
  const toAdmin = await owner.functions.invoke("admin-impersonate", { body: { user_id: secondId } });
  assert.ok(toAdmin.error, "в аккаунт администратора войти нельзя");
  log("второй администратор и вход в аккаунт администратора запрещены");

  assert.deepEqual(errors, [], `ошибки в консоли: ${errors.join("; ")}`);
  console.log("\nВход в аккаунт: все сценарии пройдены");
} finally {
  await browser.close();
}
