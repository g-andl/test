// Окно поддержки в браузере: пишет посторонний → владелец видит и удаляет → смена приватности →
// админ правит и добавляет сообщение от имени пользователя.
// Запуск: npm run test:e2e:support (нужны локальный Supabase и сайт на :3000)
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
const login = async (page, username) => {
  await page.goto(`${BASE}/login/`);
  await page.getByLabel("Имя пользователя или почта").fill(username);
  await page.getByLabel("Пароль", { exact: true }).fill("Passw0rd!x");
  await page.getByRole("button", { name: "Войти" }).click();
};

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const errors = [];
try {
  const ownerId = await mk(`own_${run}`, "Владелица");
  const writerId = await mk(`wr_${run}`, "Автор");
  const bossId = await mk(`boss_${run}`, "Иван Иванов");
  await admin.from("admins").insert({ user_id: bossId });
  const newCtx = async (w = 390) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: 844 }, deviceScaleFactor: 2, locale: "ru-RU" });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    return { ctx, page };
  };

  // 1. Посторонний пишет тёплые слова
  const w = await newCtx();
  await login(w.page, `wr_${run}`);
  await w.page.waitForURL(`${BASE}/`);
  await w.page.goto(`${BASE}/user/?u=own_${run}`);
  await w.page.getByRole("heading", { name: /Окно поддержки/ }).waitFor();
  await w.page.getByLabel("Сообщение").fill("Ты молодец, держись!");
  await w.page.screenshot({ path: `${SHOTS}/s1-write.png`, fullPage: true });
  await w.page.getByRole("button", { name: "Отправить" }).click();
  await w.page.getByText("Сообщение отправлено").waitFor();
  await w.page.getByText("Ты молодец, держись!").waitFor();
  log("посторонний оставил сообщение, оно видно на окне");

  // 2. Владелица видит уведомление и сообщение, удаляет одно
  const o = await newCtx();
  await login(o.page, `own_${run}`);
  await o.page.waitForURL(`${BASE}/`);
  await o.page.goto(`${BASE}/notifications/`);
  await o.page.getByText(/оставил\(а\) тебе сообщение в окне поддержки/).waitFor();
  await o.page.getByText(/оставил\(а\) тебе сообщение/).click();
  await o.page.waitForURL(/\/support\//);
  await o.page.getByText("Ты молодец, держись!").waitFor();
  await o.page.screenshot({ path: `${SHOTS}/s2-owner.png` });

  // Главная: блок «Окно поддержки» стоит сразу после «Как ты сегодня» и показывает сообщение
  await o.page.goto(`${BASE}/`);
  const preview = o.page.locator('section[aria-label="Окно поддержки"]:visible');
  await preview.getByText("Ты молодец, держись!").waitFor();
  const pos = await o.page.evaluate(() => {
    const vis = (e) => e.getClientRects().length > 0;
    const top = (e) => e?.getBoundingClientRect().top ?? -1;
    return {
      picker: top([...document.querySelectorAll("h2")].find((e) => vis(e) && /Как ты (сегодня|сейчас)/.test(e.textContent))),
      support: top([...document.querySelectorAll('section[aria-label="Окно поддержки"]')].find(vis)),
    };
  });
  assert.ok(pos.support > pos.picker, `блок поддержки ниже выбора настроения: ${JSON.stringify(pos)}`);
  await o.page.screenshot({ path: `${SHOTS}/s2b-home-support.png` });
  await preview.getByRole("link", { name: /Открыть|Все/ }).click();
  await o.page.waitForURL(/\/support\//);
  log("на главной блок «Окно поддержки» после «Как ты сегодня», ссылка открывает все сообщения");

  // Ответы как комментарии: владелец отвечает, автор отвечает в ответ
  await o.page.getByRole("button", { name: "Ответить" }).first().click();
  await o.page.getByLabel(/Ответ для/).fill("Спасибо, мне приятно!");
  await o.page.getByRole("button", { name: "Отправить ответ" }).click();
  await o.page.getByText("Ответ отправлен").waitFor();
  await o.page.getByText("Спасибо, мне приятно!").waitFor();
  await o.page.screenshot({ path: `${SHOTS}/s2c-thread.png` });
  await w.page.goto(`${BASE}/notifications/`);
  await w.page.getByText(/ответил\(а\) в окне поддержки/).click();
  await w.page.waitForURL(/\/user\/\?u=own_/);
  await w.page.getByText("Спасибо, мне приятно!").waitFor();
  await w.page.getByRole("button", { name: "Ответить" }).last().click();
  assert.match(await w.page.getByLabel(/Ответ для/).inputValue(), /^Владелица, /, "ответ на ответ начинается с имени");
  await w.page.getByLabel(/Ответ для/).fill("Владелица, обращайся!");
  await w.page.getByRole("button", { name: "Отправить ответ" }).click();
  await w.page.getByText("Ответ отправлен").waitFor();
  await o.page.reload();
  await o.page.getByText("обращайся!").waitFor();
  log("ответы как комментарии: владелец отвечает, автор отвечает в ответ, уведомления ведут в ветку");

  await o.page.getByRole("button", { name: "Удалить сообщение" }).first().click();
  await o.page.getByRole("button", { name: "Удалить?" }).click();
  await o.page.getByText("Сообщение удалено").waitFor();
  await o.page.getByText("Пока никто ничего не оставил").waitFor();
  log("владелица получила уведомление и удалила сообщение в два касания");

  // 3. Приватность: «писать могут только друзья», «видит только я»
  await o.page.goto(`${BASE}/settings/privacy/`);
  await o.page.getByRole("radiogroup", { name: "Кто может писать в окно поддержки" }).getByRole("radio", { name: "Только друзья" }).click();
  await o.page.getByRole("radiogroup", { name: "Кто видит сообщения в окне поддержки" }).getByRole("radio", { name: "Только я" }).click();
  await o.page.getByText(/личный ящик тёплых слов/).waitFor().catch(() => undefined);
  await o.page.waitForTimeout(600);
  await o.page.screenshot({ path: `${SHOTS}/s3-privacy.png`, fullPage: true });
  const { data: pv } = await admin.from("privacy_settings").select("support_write, support_view").eq("user_id", ownerId).single();
  assert.equal(pv.support_write, "friends");
  assert.equal(pv.support_view, "owner");
  await w.page.goto(`${BASE}/user/?u=own_${run}`);
  await w.page.getByText(/ограничил\(а\), кто может писать/).waitFor().catch(async () => {
    // при «видит только я» и «пишут друзья» посторонний не видит раздела вовсе
    assert.equal(await w.page.getByRole("heading", { name: /Окно поддержки/ }).count(), 0);
  });
  assert.equal(await w.page.getByLabel("Сообщение").count(), 0, "посторонний больше не может писать");
  log("после смены приватности посторонний не может писать");

  // 4. Админ правит и добавляет сообщение от имени пользователя
  await admin.from("support_messages").insert({ recipient_id: ownerId, author_id: writerId, body: "сообщение для правки" });
  const a = await newCtx(1100);
  await login(a.page, `boss_${run}`);
  await a.page.waitForURL(/\/admin\//);
  await a.page.getByLabel("Поиск пользователей").fill(`own_${run}`);
  await a.page.getByRole("button", { name: new RegExp(`@own_${run}`) }).click();
  const sheet = a.page.getByRole("dialog");
  await sheet.getByRole("heading", { name: /Окно поддержки/ }).waitFor();
  await sheet.getByText("сообщение для правки").waitFor();
  await sheet.getByRole("button", { name: "Изменить" }).first().click();
  await sheet.getByLabel("Текст сообщения").fill("исправлено админом");
  await sheet.getByRole("button", { name: "Сохранить" }).last().click();
  await a.page.getByText("Сообщение изменено").waitFor();
  await sheet.getByText("правлено админом", { exact: true }).waitFor();
  await sheet.getByLabel("Автор сообщения").fill(`wr_${run}`);
  await sheet.getByLabel("Текст нового сообщения").fill("добавлено от чужого имени");
  await sheet.getByRole("button", { name: "Добавить", exact: true }).last().click();
  await a.page.getByText("Сообщение добавлено").waitFor();
  await sheet.getByText("создано админом", { exact: true }).waitFor();
  await a.page.screenshot({ path: `${SHOTS}/s4-admin.png` });
  const { data: forged } = await admin.from("support_messages").select("author_id, created_by_admin").eq("body", "добавлено от чужого имени").single();
  assert.equal(forged.author_id, writerId);
  assert.equal(forged.created_by_admin, bossId);
  log("админ исправил сообщение и добавил новое от имени пользователя");

  // Владелица видит исправленное и добавленное без пометок админа
  await o.page.goto(`${BASE}/support/`);
  await o.page.getByText("исправлено админом").waitFor();
  await o.page.getByText("добавлено от чужого имени").waitFor();
  assert.equal(await o.page.getByText("создано админом", { exact: true }).count(), 0, "пометки админа владелице не видны");
  log("владелица видит сообщения без пометок админа");
  for (const c of [w, o, a]) await c.ctx.close();
} finally {
  await browser.close();
}
if (errors.length) {
  console.error("Ошибки страницы:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("\nОкно поддержки: все сценарии пройдены");
