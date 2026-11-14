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
  await page.getByText("Не помнишь ни имени, ни почты?").waitFor();
  await page.getByLabel("Имя пользователя или почта").fill(`lost_${run}`);
  await page.getByLabel("Telegram или VK для связи").fill(`@tg_${run}`);
  await page.getByLabel("Что случилось").fill("Забыл пароль, сменил телефон");
  await page.screenshot({ path: `${SHOTS}/a1-recovery-form.png` });
  await page.getByRole("button", { name: "Отправить заявку" }).click();
  await page.getByText("Заявка отправлена").waitFor();
  log("заявка на восстановление отправлена");

  // 2. Админ входит по имени пользователя и попадает в панель
  await page.goto(`${BASE}/login/`);
  await page.getByLabel("Имя пользователя или почта").fill(`boss_${run}`);
  await page.getByLabel("Пароль", { exact: true }).fill("Passw0rd!x");
  await page.getByRole("button", { name: "Войти" }).click();
  await page.waitForURL(/\/admin\//, { timeout: 15000 });
  await page.getByRole("heading", { name: "Админ-панель" }).waitFor();
  log("админ вошёл по имени и попал в панель");

  // 3. Заявки
  await page.getByRole("tab", { name: /Заявки/ }).click();
  await page.getByRole("tab", { name: /Новые/ }).waitFor();
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

  await sheet.getByText("Почта для восстановления").first().waitFor();
  await sheet.getByRole("heading", { name: /Активность/ }).waitFor();
  await sheet.getByRole("heading", { name: "Приватность" }).waitFor();
  await sheet.getByRole("radio", { name: "Закрытый профиль" }).click();
  await page.getByText("Приватность изменена").waitFor();
  const { data: pv } = await admin.from("privacy_settings").select("public_visibility").eq("user_id", userId).single();
  assert.equal(pv.public_visibility, "none");
  log("активность, почта и приватность в карточке; приватность изменена админом");

  // 3б. Отметка за пользователя
  await sheet.getByRole("button", { name: "Добавить отметку" }).click();
  await sheet.getByRole("radiogroup", { name: "Настроение новой отметки" }).getByRole("radio", { name: "Отлично" }).click();
  await sheet.getByLabel("Заметка новой отметки").fill("добавлено админом");
  await sheet.getByRole("button", { name: "Добавить", exact: true }).last().click();
  await page.getByText("Отметка добавлена").waitFor();
  const { data: added } = await admin.from("mood_entries").select("mood_value").eq("user_id", userId).eq("note", "добавлено админом");
  assert.equal(added.length, 1);
  assert.equal(added[0].mood_value, 5);
  log("отметка за пользователя добавлена");

  // 4. Новый пароль
  await sheet.getByLabel("Новый пароль").fill("Temp2026pass");
  await sheet.getByRole("button", { name: "Задать" }).click();
  await page.getByText("Пароль изменён").waitFor();
  await page.getByRole("button", { name: "Закрыть" }).click();
  await page.getByRole("tab", { name: /Заявки/ }).click();
  await card.getByRole("button", { name: "Решено" }).click();
  await page.getByText("Заявка закрыта").waitFor();
  await page.getByRole("tab", { name: /Решённые · 1/ }).click();
  await page.getByText(`@tg_${run}`).waitFor();
  log("заявка перешла в раздел «Решённые»");
  await card.getByRole("button", { name: "Удалить заявку" }).click();
  await card.getByRole("button", { name: "Точно удалить?" }).click();
  await page.getByText("Заявка удалена").waitFor();
  log("заявка удалена в два касания");
  log("пароль задан, заявка закрыта");

  // 4б. Удаление аккаунта в два касания
  const victimId = await mk(`victim_${run}`, "Удаляемый");
  await page.getByRole("tab", { name: /Пользователи/ }).click();
  await page.getByLabel("Поиск пользователей").fill(`victim_${run}`);
  await page.getByText("Удаляемый").click();
  await sheet.getByRole("button", { name: "Удалить аккаунт" }).click();
  await sheet.getByRole("button", { name: "Точно удалить?" }).click();
  await page.getByText("Аккаунт удалён").waitFor();
  const { data: gone } = await admin.from("profiles").select("id").eq("id", victimId);
  assert.equal(gone.length, 0);
  log("удаление аккаунта в два касания");

  // 4в. Смена своего пароля во вкладке «Настройки»
  await page.getByLabel("Поиск пользователей").fill("");
  await page.getByRole("tab", { name: "Настройки" }).click();
  await page.getByLabel("Новый пароль").fill("BossNew2026");
  await page.getByLabel("Повтори пароль").fill("BossNew2026");
  await page.getByRole("button", { name: "Сохранить пароль" }).click();
  await page.getByText("Пароль изменён").waitFor();
  await page.screenshot({ path: `${SHOTS}/a5-admin-settings.png` });
  log("смена своего пароля в «Настройках»");

  // 4г. Блокировка: админ блокирует на 7 дней → пользователь входит и видит экран блокировки → разблокировка
  await page.getByRole("tab", { name: /Пользователи/ }).click();
  await page.getByLabel("Поиск пользователей").fill(`lost_${run}`);
  await page.getByRole("button", { name: new RegExp(`@lost_${run}`) }).click();
  const sheet2 = page.getByRole("dialog");
  await sheet2.getByRole("heading", { name: "Блокировка" }).waitFor();
  await sheet2.getByRole("radio", { name: "7 дней" }).click();
  await sheet2.getByLabel("Причина блокировки").fill("Нарушение правил");
  await sheet2.getByRole("button", { name: "Заблокировать" }).click();
  await sheet2.getByRole("button", { name: "Точно заблокировать?" }).click();
  await page.getByText("Аккаунт заблокирован").first().waitFor();
  await page.screenshot({ path: `${SHOTS}/a6-admin-block.png` });
  const { data: blk } = await admin.from("user_blocks").select("blocked_until, reason").eq("user_id", userId).single();
  assert.equal(blk.reason, "Нарушение правил");
  assert.ok(new Date(blk.blocked_until).getTime() > Date.now() + 6 * 86400000, "блокировка на 7 дней");
  await page.getByRole("button", { name: "Закрыть" }).click();
  await page.getByText("Заблокирован", { exact: true }).first().waitFor();
  log("админ заблокировал аккаунт на 7 дней, значок в списке");

  const cb = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: "ru-RU", isMobile: true });
  const pb = await cb.newPage();
  await pb.goto(`${BASE}/login/`);
  await pb.getByLabel("Имя пользователя или почта").fill(`lost_${run}`);
  await pb.getByLabel("Пароль", { exact: true }).fill("Temp2026pass");
  await pb.getByRole("button", { name: "Войти" }).click();
  await pb.getByRole("heading", { name: "Аккаунт заблокирован" }).waitFor({ timeout: 15000 });
  await pb.getByText("Нарушение правил").waitFor();
  await pb.getByText(/Доступ ограничен до/).waitFor();
  assert.equal(await pb.getByRole("button", { name: "Хорошо" }).count(), 0, "приложения за экраном блокировки нет");
  await pb.screenshot({ path: `${SHOTS}/a7-blocked-screen.png` });
  log("заблокированный вошёл и видит экран блокировки со сроком и причиной");

  // Разблокировка: экран исчезает сам (проверка раз в 30 секунд — ускоряем перезагрузкой)
  await sheet2.waitFor({ state: "detached" }).catch(() => undefined);
  await page.getByRole("button", { name: new RegExp(`@lost_${run}`) }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Разблокировать" }).click();
  await page.getByText("Аккаунт разблокирован").waitFor();
  await page.getByRole("button", { name: "Закрыть" }).click();
  await pb.reload();
  await pb.waitForURL(`${BASE}/`, { timeout: 15000 });
  await pb.getByRole("heading", { name: /Как ты сегодня|Как ты сейчас/ }).waitFor();
  log("после разблокировки приложение снова доступно");
  await cb.close();

  // 5. Пользователь входит с новым паролем и видит админа с пометкой
  await page.getByRole("button", { name: "Выйти" }).click();
  await page.waitForURL(/\/login\//);
  await page.getByLabel("Имя пользователя или почта").fill(`lost_${run}`);
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
  await p2.getByLabel("Имя", { exact: true }).fill("Новичок");
  // Имя admin занять нельзя
  await p2.getByLabel("Имя пользователя").fill(`admin`);
  await p2.getByText("Это имя уже занято").waitFor();
  await p2.getByLabel("Имя пользователя").fill(`new_${run}`);
  await p2.getByText("✓ Имя свободно").waitFor();
  await p2.getByLabel("Почта", { exact: true }).fill(`new_${run}@mail.test`);
  await p2.getByLabel("Пароль", { exact: true }).fill("Passw0rd!x");
  await p2.getByLabel("Принимаю все условия").check();
  await p2.getByRole("button", { name: "Зарегистрироваться" }).click();
  await p2.waitForURL(/\/onboarding\//, { timeout: 15000 });
  log("регистрация с почтой (без кодов) работает, имя admin занято");
  // Вход по почте
  await p2.goto(`${BASE}/settings/account/`);
  await p2.getByRole("button", { name: "Выйти" }).count();
  await c2.close();
  const c3 = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ru-RU" });
  const p3 = await c3.newPage();
  await p3.goto(`${BASE}/login/`);
  await p3.getByLabel("Имя пользователя или почта").fill(`new_${run}@mail.test`);
  await p3.getByLabel("Пароль", { exact: true }).fill("Passw0rd!x");
  await p3.getByRole("button", { name: "Войти" }).click();
  await p3.waitForURL(/\/(onboarding)?\/?$/, { timeout: 15000 });
  log("вход по почте работает");
  await c3.close();
} finally {
  await browser.close();
}
if (errors.length) {
  console.error("Ошибки страницы:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("\nАдминка: все сценарии пройдены");
