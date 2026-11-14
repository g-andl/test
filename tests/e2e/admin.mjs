// Сквозной сценарий админки: заявка на восстановление → вход админа по имени →
// поиск аккаунта → новый пароль → пользователь входит с ним. Плюс пометка «Администратор».
// Запуск: npm run test:e2e:admin (нужны локальный Supabase и сайт на :3000)
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

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const errors = [];
try {
  // Админ и обычный пользователь — без почты, служебные адреса
  const mk = async (username, name) => {
    const { data, error } = await admin.auth.admin.createUser({
      email: `u_${username}@users.nastroy.local`, password: "Passw0rd!x", email_confirm: true,
      user_metadata: { username, display_name: name },
    });
    if (error) throw error;
    await admin.from("profiles").update({ onboarded: true }).eq("id", data.user.id);
    return data.user.id;
  };
  // Защита от спама принимает не больше 5 заявок в час с одного адреса — чистим заявки прошлых прогонов
  await admin.from("recovery_requests").delete().gte("created_at", "2000-01-01");
  const bossId = await mk(`boss_${run}`, "Иван Иванов");
  await admin.from("admins").insert({ user_id: bossId });
  const userId = await mk(`lost_${run}`, "Потеряшка");
  await admin.from("mood_entries").insert({ user_id: userId, entry_date: "2026-11-14", mood_value: 2, note: "заметка пользователя", mood_time: new Date().toISOString(), day_part: "day" });

  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: "ru-RU", isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));

  // 1. Пользователь забыл пароль — оставляет заявку
  await page.goto(`${BASE}/login/`);
  await page.getByRole("link", { name: "Не получается войти?" }).click();
  await page.getByLabel("Имя пользователя").fill(`lost_${run}`);
  await page.getByLabel("Telegram или VK для связи").fill(`@tg_${run}`);
  await page.getByLabel("Что случилось").fill("Забыл пароль, сменил телефон");
  await page.screenshot({ path: `${SHOTS}/a1-recovery-form.png` });
  await page.getByRole("button", { name: "Отправить заявку" }).click();
  await page.getByText("Заявка отправлена").waitFor();
  log("заявка на восстановление отправлена");

  // 2. Админ входит по имени пользователя и попадает в панель
  await page.goto(`${BASE}/login/`);
  await page.getByLabel("Имя пользователя").fill(`boss_${run}`);
  await page.getByLabel("Пароль", { exact: true }).fill("Passw0rd!x");
  await page.getByRole("button", { name: "Войти" }).click();
  await page.waitForURL(/\/admin\//, { timeout: 15000 });
  await page.getByRole("heading", { name: "Админ-панель" }).waitFor();
  log("админ вошёл по имени и попал в панель");

  // 3. Заявки
  await page.getByRole("tab", { name: /Заявки/ }).click();
  await page.getByText(`@tg_${run}`).waitFor();
  await page.screenshot({ path: `${SHOTS}/a2-admin-recovery.png`, fullPage: true });
  const card = page.getByRole("listitem").filter({ hasText: `@tg_${run}` }).filter({ hasText: "Забыл пароль" });
  await card.getByRole("button", { name: /открыть аккаунт/ }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByText("Аккаунт создан").waitFor();
  await sheet.getByLabel("Заметка").first().waitFor();
  assert.equal(await sheet.getByLabel("Заметка").first().inputValue(), "заметка пользователя");
  await page.screenshot({ path: `${SHOTS}/a3-admin-user.png` });
  log("карточка пользователя: дата создания и отметки видны");

  // 4. Новый пароль
  await sheet.getByLabel("Новый пароль").fill("Temp2026pass");
  await sheet.getByRole("button", { name: "Задать" }).click();
  await page.getByText("Пароль изменён").waitFor();
  await page.getByRole("button", { name: "Закрыть" }).click();
  await page.getByRole("tab", { name: /Заявки/ }).click();
  await card.getByRole("button", { name: "Решено" }).click();
  await page.getByText("Заявка закрыта").waitFor();
  log("пароль задан, заявка закрыта");

  // 5. Пользователь входит с новым паролем и видит админа с пометкой
  await page.getByRole("button", { name: "Выйти" }).click();
  await page.waitForURL(/\/login\//);
  await page.getByLabel("Имя пользователя").fill(`lost_${run}`);
  await page.getByLabel("Пароль", { exact: true }).fill("Temp2026pass");
  await page.getByRole("button", { name: "Войти" }).click();
  await page.waitForURL(`${BASE}/`, { timeout: 15000 });
  log("пользователь вошёл с новым паролем");
  await page.goto(`${BASE}/friends/`);
  await page.getByLabel("Поиск друзей").fill(`boss_${run}`);
  await page.getByText("Администратор").first().waitFor();
  assert.equal(await page.getByRole("button", { name: "Добавить" }).count(), 0, "админа нельзя добавить");
  await page.screenshot({ path: `${SHOTS}/a4-admin-in-search.png` });
  log("админ в поиске с пометкой, без кнопки «Добавить»");

  // 6. Обычный пользователь в /admin/ не попадает
  await page.goto(`${BASE}/admin/`);
  await page.getByText("Нет доступа").waitFor();
  log("обычному пользователю админка закрыта");

  // 7. Регистрация без почты
  const c2 = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ru-RU" });
  const p2 = await c2.newPage();
  await p2.goto(`${BASE}/register/`);
  assert.equal(await p2.getByLabel("Почта").count(), 0, "поля почты нет");
  await p2.getByLabel("Имя", { exact: true }).fill("Новичок");
  await p2.getByLabel("Имя пользователя").fill(`new_${run}`);
  await p2.getByText("✓ Имя свободно").waitFor();
  await p2.getByLabel("Пароль", { exact: true }).fill("Passw0rd!x");
  await p2.getByLabel("Принимаю все условия").check();
  await p2.getByRole("button", { name: "Зарегистрироваться" }).click();
  await p2.waitForURL(/\/onboarding\//, { timeout: 15000 });
  log("регистрация без почты работает");
  await c2.close();
} finally {
  await browser.close();
}
if (errors.length) {
  console.error("Ошибки страницы:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("\nАдминка: все сценарии пройдены");
