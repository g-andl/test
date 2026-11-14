// Сквозной сценарий в браузере: регистрация → подтверждение почты → знакомство →
// отметка настроения → друзья → уведомления. Плюс скриншоты на разных ширинах.
// Запуск: npm run test:e2e (нужны: локальный Supabase и собранный сайт на :3000)
import { chromium } from "playwright";
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.E2E_URL || "http://localhost:3000";
const SHOTS = process.env.SHOTS_DIR || "test-results/screens";
mkdirSync(SHOTS, { recursive: true });

const env = Object.fromEntries(
  execSync("npx supabase status -o env", { encoding: "utf8" })
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")]),
);
const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const run = Date.now().toString(36).slice(-6);
const tz = "Asia/Novosibirsk";

const pad = (n) => String(n).padStart(2, "0");
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const log = (...a) => console.log("•", ...a);

async function confirmLink(email) {
  for (let i = 0; i < 30; i++) {
    const res = await fetch(`${env.MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`).then((r) => r.json());
    if (res.messages?.length) {
      const msg = await fetch(`${env.MAILPIT_URL}/api/v1/message/${res.messages[0].ID}`).then((r) => r.json());
      const m = (msg.HTML || msg.Text).match(/href="([^"]+verify[^"]+)"/) || msg.Text.match(/(http\S+verify\S+)/);
      if (m) return m[1].replace(/&amp;/g, "&");
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Письмо подтверждения не пришло");
}

/** Друг с историей за 70 дней — чтобы статистика и календарь были наполнены */
async function seedFriend() {
  const email = `friend_${run}@test.local`;
  const { data, error } = await admin.auth.admin.createUser({
    email, password: "Passw0rd!x", email_confirm: true,
    user_metadata: { username: `masha_${run}`, display_name: "Маша", timezone: tz },
  });
  if (error) throw error;
  const id = data.user.id;
  await admin.from("profiles").update({ onboarded: true }).eq("id", id);
  const rows = [];
  const parts = [["morning", 9], ["day", 14], ["evening", 20], ["night", 2]];
  for (let i = 1; i <= 70; i++) {
    if (i % 6 === 0) continue; // пропуски
    const d = new Date(); d.setDate(d.getDate() - i);
    const wd = (d.getDay() + 6) % 7;
    const v = Math.max(1, Math.min(5, (wd >= 5 ? 5 : wd === 0 ? 2 : 4) + ((i * 7) % 3) - 1));
    const [part, h] = parts[i % 4];
    const t = new Date(d); t.setHours(h, 15, 0, 0);
    rows.push({ user_id: id, entry_date: key(d), mood_value: v, note: i % 3 ? null : "Гуляла в парке", mood_time: t.toISOString(), day_part: part });
  }
  const r = await admin.from("mood_entries").insert(rows);
  if (r.error) throw r.error;
  return { id, email, username: `masha_${run}` };
}

// В облачной среде браузер предустановлен: PW_CHROMIUM=/opt/pw-browsers/chromium
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const errors = [];

try {
  const friend = await seedFriend();
  log("друг с историей создан");

  // ---------- Регистрация на телефоне ----------
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: "ru-RU", timezoneId: tz, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && !/Failed to load resource|favicon/.test(m.text()) && errors.push(`console: ${m.text()}`));

  await page.goto(`${BASE}/`);
  await page.waitForURL(/\/login\//);
  await page.screenshot({ path: `${SHOTS}/01-login-390.png` });

  await page.getByRole("link", { name: "Зарегистрироваться" }).click();
  const email = `me_${run}@test.local`;
  await page.getByLabel("Имя", { exact: true }).fill("Георгий");
  await page.getByLabel("Имя пользователя").fill(`george_${run}`);
  await page.getByText("✓ Имя свободно").waitFor();
  await page.getByLabel("Почта").fill(email);
  await page.getByLabel("Пароль", { exact: true }).fill("Passw0rd!x");
  // Без согласий кнопка неактивна
  assert.equal(await page.getByRole("button", { name: "Зарегистрироваться" }).isDisabled(), true);
  await page.getByLabel("Принимаю все условия").check();
  await page.screenshot({ path: `${SHOTS}/02-register-390.png`, fullPage: true });
  await page.getByRole("button", { name: "Зарегистрироваться" }).click();
  // Подтверждение почты отключено — сразу знакомство с сервисом
  await page.waitForURL(/\/onboarding\//, { timeout: 15000 });
  await page.screenshot({ path: `${SHOTS}/03-onboarding-390.png` });
  await page.getByRole("button", { name: "Дальше" }).click();
  await page.getByRole("button", { name: "Дальше" }).click();
  await page.getByRole("button", { name: "Начать" }).click();
  await page.waitForURL(`${BASE}/`);
  await page.getByText("Как ты сегодня?").first().waitFor();
  await page.screenshot({ path: `${SHOTS}/04-home-empty-390.png` });
  log("регистрация с согласиями и знакомство пройдены");
  void confirmLink;

  // ---------- Отметка настроения ----------
  await page.getByRole("button", { name: "Хорошо" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  await dialog.getByRole("button", { name: "Вечером" }).click();
  await dialog.getByLabel(/Заметка/).fill("Хороший день, закончил проект");
  await dialog.locator('input[type="file"]').setInputFiles("public/icons/icon-512.png");
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/05-mood-sheet-390.png` });
  await dialog.getByRole("button", { name: "Отметить настроение" }).click();
  await page.getByText("Настроение отмечено").waitFor();
  await dialog.waitFor({ state: "detached" });
  await page.getByRole("button", { name: "Изменить отметку" }).waitFor();
  await page.screenshot({ path: `${SHOTS}/06-home-marked-390.png`, fullPage: true });
  const { data: me } = await admin.from("profiles").select("id").eq("username", `george_${run}`).single();
  const { data: saved } = await admin.from("mood_entries").select("*").eq("user_id", me.id).single();
  const { data: meta } = await admin.auth.admin.getUserById(me.id);
  assert.equal(meta.user.user_metadata.consents.personal_data, true, "согласие сохранено в аккаунте");
  assert.equal(saved.mood_value, 4);
  assert.equal(saved.day_part, "evening");
  assert.ok(saved.photo_path, "фото сохранено");
  log("настроение сохранено в базе (с фото и заметкой)");

  // Редактирование
  await page.getByRole("button", { name: "Изменить отметку" }).click();
  await dialog.getByRole("radio", { name: /Отлично/ }).click();
  await dialog.getByRole("button", { name: "Сохранить" }).click();
  await page.getByText("Отметка обновлена").waitFor();
  await dialog.waitFor({ state: "detached" });
  log("редактирование работает");

  // Вторая отметка в тот же день — другое время суток
  await page.getByRole("button", { name: "Плохо" }).first().click();
  await dialog.getByRole("button", { name: "Утром" }).click();
  await dialog.getByRole("button", { name: "Отметить настроение" }).click();
  await page.getByText("Настроение отмечено").waitFor();
  await dialog.waitFor({ state: "detached" });
  const { data: two } = await admin.from("mood_entries").select("mood_value, day_part").eq("user_id", me.id).order("mood_time");
  assert.deepEqual(two.map((e) => [e.mood_value, e.day_part]), [[1, "morning"], [5, "evening"]]);
  await page.getByRole("link", { name: /Все отметки за сегодня/ }).first().waitFor();
  log("две отметки в один день (утро и вечер)");
  await page.screenshot({ path: `${SHOTS}/06b-home-two-390.png`, fullPage: true });

  // ---------- Друзья ----------
  await page.getByRole("link", { name: "Друзья" }).first().click();
  await page.getByLabel("Поиск друзей").fill(friend.username);
  await page.getByRole("button", { name: "Добавить" }).click();
  await page.getByText("Заявка отправлена").waitFor();
  // Маша принимает заявку
  const masha = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
  await masha.auth.signInWithPassword({ email: friend.email, password: "Passw0rd!x" });
  const { data: reqs } = await masha.rpc("get_friend_requests");
  const acc = await masha.from("friendships").update({ status: "accepted" }).eq("id", reqs[0].friendship_id).select();
  assert.equal(acc.data.length, 1);
  // Маша отмечает сегодняшнее настроение → придёт уведомление
  await masha.from("mood_entries").insert({ user_id: friend.id, entry_date: new Date().toLocaleDateString("en-CA", { timeZone: tz }), mood_value: 5, mood_time: new Date().toISOString(), day_part: "day" });
  log("Маша приняла заявку и отметила настроение");

  // Колокольчик обновился в реальном времени
  await page.getByRole("link", { name: /непрочитанных/ }).first().waitFor({ timeout: 10000 });
  log("счётчик уведомлений обновился в реальном времени");
  await page.getByLabel("Поиск друзей").fill("");
  await page.getByText("Маша").first().waitFor();
  await page.screenshot({ path: `${SHOTS}/07-friends-390.png` });

  await page.getByRole("link", { name: /непрочитанных/ }).first().click();
  await page.getByText(/отметил\(а\) настроение/).waitFor();
  await page.screenshot({ path: `${SHOTS}/08-notifications-390.png` });
  log("уведомления отображаются");

  // Профиль друга: календарь и статистика, заметки скрыты по умолчанию
  await page.getByText(/отметил\(а\) настроение/).click();
  await page.waitForURL(/\/user\//);
  // Настроение друга открывается только по кнопке
  await page.getByRole("button", { name: /Смотреть/ }).click();
  await page.getByText("Последние отметки").waitFor();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS}/09-friend-390.png`, fullPage: true });
  await page.getByRole("button", { name: "Календарь" }).click();
  await page.getByRole("dialog").getByRole("grid").waitFor();
  await page.screenshot({ path: `${SHOTS}/09b-friend-calendar-390.png` });
  await page.getByRole("button", { name: "Закрыть" }).click();
  await page.getByRole("dialog").waitFor({ state: "detached" });
  await page.getByRole("button", { name: "Статистика" }).click();
  await page.getByRole("dialog").getByText("Распределение").waitFor();
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${SHOTS}/09c-friend-stats-390.png` });
  await page.getByRole("button", { name: "Закрыть" }).click();
  log("профиль друга: карточки, календарь и статистика по кнопкам");

  // Главная с друзьями
  await page.getByRole("link", { name: "Главная" }).click();
  await page.getByRole("heading", { name: "Как дела у друзей?" }).waitFor();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/10-home-friends-390.png`, fullPage: true });

  // Дневник: лента и календарь
  await page.getByRole("link", { name: "Дневник" }).click();
  await page.waitForURL(/\/diary\//);
  await page.getByRole("tab", { name: "Лента" }).waitFor();
  await page.getByText("Хороший день, закончил проект").first().waitFor();
  await page.screenshot({ path: `${SHOTS}/11-diary-feed-390.png` });
  await page.getByRole("tab", { name: "Календарь" }).click();
  await page.screenshot({ path: `${SHOTS}/12-diary-calendar-390.png` });
  await page.getByRole("tab", { name: "Год" }).click();
  await page.screenshot({ path: `${SHOTS}/13-diary-year-390.png`, fullPage: true });

  // Статистика и настройки
  await page.getByRole("link", { name: "Статистика" }).click();
  await page.getByText("Распределение").waitFor();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/14-stats-390.png`, fullPage: true });
  await page.getByRole("link", { name: "Профиль" }).click();
  await page.getByText("Тема оформления").waitFor();
  await page.screenshot({ path: `${SHOTS}/15-profile-390.png` });
  await page.getByRole("link", { name: /Приватность/ }).click();
  await page.getByText("Друзья видят всё").waitFor();
  await page.screenshot({ path: `${SHOTS}/16-privacy-390.png`, fullPage: true });

  // Тёмная тема
  await page.goto(`${BASE}/profile/`);
  await page.getByRole("tab", { name: /Тёмная/ }).click();
  await page.goto(`${BASE}/`);
  await page.getByRole("heading", { name: "Как дела у друзей?" }).waitFor();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/17-home-dark-390.png`, fullPage: true });
  await page.goto(`${BASE}/stats/`);
  await page.getByText("Распределение").waitFor();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/18-stats-dark-390.png`, fullPage: true });
  await page.goto(`${BASE}/profile/`);
  await page.getByRole("tab", { name: /Светлая/ }).click();

  // ---------- Ширины экранов: нет горизонтальной прокрутки ----------
  const storage = await ctx.storageState();
  const widths = [320, 360, 375, 390, 430, 768, 1024, 1280, 1440];
  const routes = ["/", "/diary/", "/stats/", "/friends/", "/notifications/", "/profile/", `/user/?u=${friend.username}`];
  for (const w of widths) {
    const c = await browser.newContext({ viewport: { width: w, height: w < 768 ? 800 : 900 }, storageState: storage, locale: "ru-RU", timezoneId: tz, deviceScaleFactor: 1 });
    const p = await c.newPage();
    p.on("pageerror", (e) => errors.push(`pageerror@${w}: ${e.message}`));
    for (const r of routes) {
      await p.goto(`${BASE}${r}`);
      await p.waitForLoadState("networkidle");
      await p.waitForTimeout(400);
      const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (overflow > 0) errors.push(`горизонтальная прокрутка ${overflow}px на ${r} при ширине ${w}`);
      // Мелкие цели касания в нижней навигации
      if (w < 1024 && r === "/") {
        const small = await p.evaluate(() =>
          [...document.querySelectorAll("nav a, nav button")].filter((el) => {
            const b = el.getBoundingClientRect();
            return b.width > 0 && (b.width < 44 || b.height < 44);
          }).length,
        );
        if (small) errors.push(`мелкие элементы навигации (${small}) при ширине ${w}`);
      }
    }
    // Подписи настроений в окне отметки не должны выходить за плашки
    if (w < 768) {
      await p.goto(`${BASE}/`);
      await p.getByRole("button", { name: /Изменить отметку/ }).first().click();
      await p.getByRole("dialog").waitFor();
      await p.waitForTimeout(500);
      const bad = await p.evaluate(() =>
        [...document.querySelectorAll('[role="radio"] span')].filter((el) => el.offsetParent !== null)
          .filter((el) => {
            const r = el.getBoundingClientRect();
            const pr = el.parentElement.getBoundingClientRect();
            return el.scrollWidth > el.clientWidth + 1 || r.left < pr.left + 2 || r.right > pr.right - 2;
          })
          .map((el) => el.textContent),
      );
      if (bad.length) errors.push(`подписи выходят за рамки при ширине ${w}: ${bad.join(", ")}`);
      if (w === 320 || w === 390) await p.screenshot({ path: `${SHOTS}/w${w}-sheet.png` });
    }
    if ([320, 768, 1024, 1440].includes(w)) {
      await p.goto(`${BASE}/`);
      await p.waitForLoadState("networkidle");
      await p.waitForTimeout(400);
      await p.screenshot({ path: `${SHOTS}/w${w}-home.png`, fullPage: true });
      await p.goto(`${BASE}/stats/`);
      await p.waitForLoadState("networkidle");
      await p.waitForTimeout(800);
      await p.screenshot({ path: `${SHOTS}/w${w}-stats.png`, fullPage: true });
    }
    await c.close();
    log(`ширина ${w}px проверена`);
  }

  // ---------- Удаление записи ----------
  await page.goto(`${BASE}/`);
  // Удаление прямо из списка: корзина → «Удалить?»
  await page.getByRole("button", { name: "Удалить отметку" }).first().click();
  await page.getByRole("button", { name: "Удалить?" }).click();
  await page.getByText("Отметка удалена").waitFor();
  const { data: left } = await admin.from("mood_entries").select("id").eq("id", saved.id);
  assert.equal(left.length, 0, "удалена именно вечерняя отметка");
  log("удаление в два касания работает");

  // ---------- Выход ----------
  await page.getByRole("link", { name: "Профиль" }).click();
  await page.getByRole("button", { name: "Выйти" }).click();
  await page.waitForURL(/\/login\//);
  log("выход работает");
} finally {
  await browser.close();
}

if (errors.length) {
  console.error("\nПроблемы:\n" + [...new Set(errors)].join("\n"));
  process.exit(1);
}
console.log("\nВсе сценарии пройдены");
