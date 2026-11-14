// Статусы в браузере: админ создаёт статус с цветом, выдаёт пользователю, пометку видят другие,
// затем меняет цвет и удаляет. Запуск: npm run test:e2e:badges
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
  const bossId = await mk(`boss_${run}`, "Иван Иванов");
  await admin.from("admins").insert({ user_id: bossId });
  const starId = await mk(`star_${run}`, "Звезда");
  const viewerId = await mk(`view_${run}`, "Зритель");
  await admin.from("friendships").insert({ requester_id: viewerId, addressee_id: starId });
  await admin.from("friendships").update({ status: "accepted" }).eq("requester_id", viewerId);
  const ctx = async (w = 1100) => {
    const c = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 2, locale: "ru-RU" });
    const p = await c.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    return { c, p };
  };

  // 1. Админ создаёт статус и выдаёт пользователю
  const a = await ctx();
  await login(a.p, `boss_${run}`);
  await a.p.waitForURL(/\/admin\//);
  await a.p.getByRole("tab", { name: "Статусы" }).click();
  await a.p.getByText("Новичок", { exact: true }).first().waitFor();
  await a.p.getByLabel("Название статуса").first().fill(`Легенда ${run}`);
  await a.p.getByLabel("Код цвета").first().fill("#8b7cf6");
  await a.p.getByRole("button", { name: "Создать" }).click();
  await a.p.getByText("Статус создан").waitFor();
  await a.p.screenshot({ path: `${SHOTS}/b1-admin-badges.png`, fullPage: true });
  log("админ создал статус с цветом");

  await a.p.getByRole("tab", { name: /Пользователи/ }).click();
  await a.p.getByLabel("Поиск пользователей").fill(`star_${run}`);
  await a.p.getByText("Звезда").click();
  const sheet = a.p.getByRole("dialog");
  await sheet.getByRole("radiogroup", { name: "Статус пользователя" }).getByRole("radio", { name: `Легенда ${run}` }).click();
  await a.p.getByText(/выдан/).waitFor();
  // свой статус: придумать и выдать сразу
  await sheet.getByRole("button", { name: "+ Свой статус" }).click();
  await sheet.getByLabel("Название статуса").fill(`Свой ${run}`);
  await sheet.getByLabel("Код цвета").fill("#e0568f");
  await sheet.getByRole("button", { name: "Создать и выдать" }).click();
  await a.p.getByText("Статус создан и выдан").waitFor();
  await a.p.screenshot({ path: `${SHOTS}/b2-admin-assign.png` });
  const { data: own } = await admin.from("user_badges").select("badge_id").eq("user_id", starId);
  assert.equal(own.length, 1, "у пользователя один статус");
  const { data: b } = await admin.from("badges").select("name, color").eq("id", own[0].badge_id).single();
  assert.equal(b.name, `Свой ${run}`);
  assert.equal(b.color, "#e0568f");
  log("статус выдан; свой статус придуман и выдан сразу");

  // 2. Другие пользователи видят пометку: профиль, список друзей
  const v = await ctx(390);
  await login(v.p, `view_${run}`);
  await v.p.waitForURL(`${BASE}/`);
  await v.p.goto(`${BASE}/friends/`);
  await v.p.getByText(`Свой ${run}`, { exact: true }).waitFor();
  await v.p.screenshot({ path: `${SHOTS}/b3-friends-badge.png` });
  await v.p.goto(`${BASE}/user/?u=star_${run}`);
  await v.p.getByText(`Свой ${run}`, { exact: true }).waitFor();
  const color = await v.p.getByText(`Свой ${run}`, { exact: true }).evaluate((el) => getComputedStyle(el.parentElement).backgroundColor);
  assert.notEqual(color, "rgba(0, 0, 0, 0)", "у пометки есть цветной фон");
  await v.p.screenshot({ path: `${SHOTS}/b4-profile-badge.png` });
  log("друг видит пометку в списке и на профиле");

  // 3. Админ меняет цвет, затем удаляет статус
  await a.p.getByRole("button", { name: "Закрыть" }).click();
  await a.p.getByRole("tab", { name: "Статусы" }).click();
  const card = a.p.getByRole("listitem").filter({ has: a.p.locator(`input[value="Свой ${run}"]`) });
  await card.getByLabel("Код цвета").fill("#2fb67c");
  await card.getByRole("button", { name: "Сохранить" }).click();
  await a.p.getByText("Статус изменён").waitFor();
  const { data: c2 } = await admin.from("badges").select("color").eq("name", `Свой ${run}`).single();
  assert.equal(c2.color, "#2fb67c");
  await card.getByRole("button", { name: "Удалить статус" }).click();
  await card.getByRole("button", { name: "Точно удалить?" }).click();
  await a.p.getByText("Статус удалён").waitFor();
  const { data: gone } = await admin.from("user_badges").select("badge_id").eq("user_id", starId);
  assert.equal(gone.length, 0, "у пользователя статус снят вместе с удалением");
  log("цвет изменён, статус удалён (снят у пользователя)");

  // 4. Администратор виден с пометкой «Администратор»
  await v.p.goto(`${BASE}/friends/`);
  await v.p.getByLabel("Поиск друзей").fill(`boss_${run}`);
  await v.p.getByText("Администратор", { exact: true }).first().waitFor();
  log("у администратора своя пометка «Администратор»");
  for (const x of [a, v]) await x.c.close();
} finally {
  await browser.close();
}
if (errors.length) {
  console.error("Ошибки страницы:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("\nСтатусы: все сценарии пройдены");
