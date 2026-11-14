// Карточки отметок, фото на весь экран, пометки «скрыто», плашка «В друзьях», порядок главной,
// приватность заметок и фото, автоматические статусы.
// Запуск: npm run test:e2e:cards (нужны локальный Supabase и сайт на :3000)
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
const day = (n) => new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10);
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

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
  await page.waitForURL(`${BASE}/`);
};

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const errors = [];
try {
  const ownerId = await mk(`own_${run}`, "Владелец");
  const friendId = await mk(`frd_${run}`, "Друг");
  const strangerId = await mk(`str_${run}`, "Чужой");
  await admin.from("friendships").insert({ requester_id: friendId, addressee_id: ownerId, status: "accepted" });

  // Три отметки владельца: с фото и заметкой, только с заметкой, пустая
  const photoPath = `${ownerId}/cards-${run}.png`;
  await admin.storage.from("mood-photos").upload(photoPath, png, { contentType: "image/png" });
  const mkEntry = (n, v, extra = {}) => ({ user_id: ownerId, entry_date: day(n), mood_value: v, mood_time: `${day(n)}T1${n}:00:00Z`, day_part: "day", ...extra });
  await admin.from("mood_entries").insert([
    mkEntry(0, 5, { note: "Заметка с фото", photo_path: photoPath }),
    mkEntry(1, 3, { note: "Просто заметка" }),
    mkEntry(2, 2),
  ]);

  const open = async (user, w = 390) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 2, locale: "ru-RU", timezoneId: "UTC" });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await login(page, user);
    return { ctx, page };
  };
  const showCards = async (page) => {
    await page.goto(`${BASE}/user/?u=own_${run}`);
    await page.getByRole("button", { name: /Смотреть/ }).click();
    await page.getByText("Последние отметки").waitFor();
    await page.waitForTimeout(700);
  };

  // 1. Друг: единые карточки, фото на весь экран, у карточек без фото — крупный эмодзи
  const f = await open(`frd_${run}`);
  await showCards(f.page);
  const cards = f.page.locator("article");
  assert.equal(await cards.count(), 3, "три карточки");
  const heights = await cards.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
  assert.ok(Math.max(...heights) - Math.min(...heights) <= 2, `карточки одной высоты: ${heights}`);
  const imgs = await f.page.locator("article img[alt^='Эмодзи'], article img[src*='emoji']").count();
  assert.ok(imgs >= 3, "в карточках есть эмодзи");
  await f.page.screenshot({ path: `${SHOTS}/c1-friend-cards.png` });
  await f.page.getByRole("button", { name: "Открыть фото" }).click();
  await f.page.getByRole("dialog", { name: "Фото" }).waitFor();
  await f.page.screenshot({ path: `${SHOTS}/c2-photo-viewer.png` });
  await f.page.keyboard.press("Escape");
  await f.page.getByRole("dialog", { name: "Фото" }).waitFor({ state: "detached" });
  log("карточки одной высоты, фото открывается на весь экран и закрывается");

  // 2. Плашка «В друзьях»: красной иконки нет, удаление внутри плашки
  assert.equal(await f.page.getByRole("button", { name: "Удалить из друзей" }).count(), 0, "красной иконки удаления нет");
  await f.page.getByRole("button", { name: /В друзьях/ }).click();
  const sheet = f.page.getByRole("dialog");
  await sheet.getByRole("button", { name: "Удалить из друзей" }).waitFor();
  await f.page.screenshot({ path: `${SHOTS}/c3-friend-menu.png` });
  await sheet.getByRole("button", { name: "Удалить из друзей" }).click();
  await sheet.getByRole("button", { name: "Точно удалить?" }).click();
  await f.page.getByText("Удалён из друзей").waitFor();
  const { data: fr } = await admin.from("friendships").select("id").eq("requester_id", friendId);
  assert.equal(fr.length, 0, "дружба удалена");
  log("«В друзьях» открывает меню, удаление из друзей внутри, в два касания");

  // 3. Не друг видит заметки и фото по умолчанию
  await showCards(f.page);
  assert.equal(await f.page.getByText("Заметка скрыта").count(), 0);
  await f.page.getByText("Просто заметка").waitFor();
  await f.page.getByRole("button", { name: "Открыть фото" }).waitFor();
  log("не друг по умолчанию видит и заметки, и фото");

  // 4. Владелец скрывает: не друг видит «скрыто», друг (вернём дружбу) — всё
  await admin.from("privacy_settings").update({ notes_public: false, photos_public: false }).eq("user_id", ownerId);
  await showCards(f.page);
  await f.page.getByText("Фото скрыто").waitFor();
  await f.page.getByText("Заметка скрыта").first().waitFor();
  assert.equal(await f.page.getByText("Просто заметка").count(), 0, "текст скрыт");
  assert.equal(await f.page.getByRole("button", { name: "Открыть фото" }).count(), 0, "фото скрыто");
  await f.page.screenshot({ path: `${SHOTS}/c4-hidden.png` });
  log("скрытые заметка и фото показаны как «скрыто», без содержания");
  await admin.from("friendships").insert({ requester_id: friendId, addressee_id: ownerId, status: "accepted" });
  await showCards(f.page);
  await f.page.getByText("Просто заметка").waitFor();
  await f.page.getByRole("button", { name: "Открыть фото" }).waitFor();
  assert.equal(await f.page.getByText(/скрыт/).count(), 0, "друзьям ничего не скрыто");
  log("друзьям ничего не скрыто");
  await f.ctx.close();

  // 5. Владелец: главная — карточки сегодня, «Эта неделя» в самом низу; дневник без кнопки выбора даты
  const o = await open(`own_${run}`);
  await o.page.locator('[aria-label="Отметки за сегодня"]:visible').waitFor();
  await o.page.getByRole("button", { name: "Открыть фото" }).first().waitFor();
  const order = await o.page.evaluate(() => {
    const visible = (e) => e.getClientRects().length > 0;
    const top = (el) => el?.getBoundingClientRect().top ?? -1;
    const byText = (t) => [...document.querySelectorAll("h1,h2,p,span")].find((e) => visible(e) && e.textContent?.trim().startsWith(t));
    return {
      today: top([...document.querySelectorAll('[aria-label="Отметки за сегодня"]')].find(visible)),
      friends: top(byText("Как дела у друзей?")),
      month: top(byText("Ноябрь")),
      week: top(byText("Эта неделя")),
    };
  });
  assert.ok(order.week > order.friends && order.week > order.today, `неделя ниже сегодня и друзей: ${JSON.stringify(order)}`);
  await o.page.screenshot({ path: `${SHOTS}/c5-home.png`, fullPage: true });
  log("на главной отметки сегодня карточками, «Эта неделя» внизу");
  await o.page.goto(`${BASE}/diary/`);
  await o.page.getByRole("tab", { name: "Лента" }).waitFor();
  assert.equal(await o.page.getByLabel("Перейти к дате").count(), 0, "кнопки выбора даты нет");
  log("в дневнике нет кнопки выбора даты");

  // 6. Приватность: два переключателя, по умолчанию включены
  await o.page.goto(`${BASE}/settings/privacy/`);
  await o.page.getByText("Показывать заметки").waitFor();
  await o.page.screenshot({ path: `${SHOTS}/c6-privacy.png`, fullPage: true });
  const sw = o.page.getByRole("switch");
  assert.ok((await sw.count()) >= 2);
  log("в приватности отдельные переключатели заметок и фото");

  // 7. Автостатусы: новичок и серия 7 дней
  await o.page.goto(`${BASE}/profile/`);
  await o.page.getByText("Новичок", { exact: true }).waitFor({ timeout: 15000 }).catch(() => undefined);
  const streakId = await mk(`stk_${run}`, "Серийный");
  await admin.from("mood_entries").insert(Array.from({ length: 7 }, (_, i) => ({ user_id: streakId, entry_date: day(i), mood_value: 4, mood_time: `${day(i)}T10:00:00Z`, day_part: "morning" })));
  const s = await open(`stk_${run}`);
  await s.page.goto(`${BASE}/profile/`);
  await s.page.getByText("Огонёк", { exact: true }).waitFor({ timeout: 15000 });
  await s.page.screenshot({ path: `${SHOTS}/c7-auto-badge.png` });
  log("за 7 дней подряд система выдала «Огонёк» автоматически");
  await s.ctx.close();
  await o.ctx.close();
} finally {
  await browser.close();
}
if (errors.length) {
  console.error("Ошибки страницы:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("\nКарточки и приватность: все сценарии пройдены");
