# Настроение — социальный трекер настроения

«Узнавай себя. Замечай перемены. Будь ближе к друзьям.»

Сайт: **https://g-andl.github.io/test/** · Документы: `/legal/`

Отмечай настроение несколько раз в день, веди дневник с заметками и фото, смотри календарь и статистику, добавляй друзей и следи, как у них дела. Это не медицинское приложение.

## Как устроено

| Часть | Технологии |
|---|---|
| Интерфейс | Next.js 16 (статическая сборка), React 19, TypeScript, Tailwind CSS 4, Recharts, Motion, Lucide |
| Данные | Supabase: PostgreSQL, Auth, Storage, Realtime, Edge Functions |
| Хостинг | GitHub Pages (сборка через GitHub Actions) |
| Эмодзи | Microsoft Fluent Emoji 3D (MIT), `public/emoji/` |

Сайт — набор статических страниц, вся логика и защита данных живут в Supabase. Кто что видит, проверяет сама база (правила RLS и функции в `supabase/migrations/`), а не только интерфейс.

**Приватность:**
- друзья видят всё;
- остальные пользователи — по настройке: всё (по умолчанию), только последнюю отметку или ничего;
- фото для не-друзей скрыто, пока его не разрешили.

## Структура

```
src/app/(app)/        экраны приложения: главная, дневник, статистика, друзья, профиль, настройки
src/app/(auth)/       вход, регистрация, восстановление пароля
src/app/legal/        политика, соглашение, согласия (152-ФЗ)
src/components/       интерфейс: ui, mood, diary, stats, home, shell
src/lib/              запросы к базе, статистика, даты, push
supabase/migrations/  схема базы, RLS, триггеры уведомлений
supabase/functions/   Edge Function send-push (Web Push)
tests/backend/        тесты безопасности базы
tests/e2e/            сквозной сценарий в браузере
public/sw.js          Service Worker: push и офлайн
```

## Локальный запуск

Нужны Node.js 22 и Docker.

```bash
npm install
```

```bash
npx supabase start
```

Скопируй `.env.example` в `.env.local` и вставь адрес и anon-ключ из вывода `npx supabase status`. Затем:

```bash
npm run dev
```

Приложение откроется на http://localhost:3000.

## Проверки

```bash
npm run typecheck && npm run lint
```

```bash
npm run test:db
```

Сквозной тест в браузере: сначала собери и запусти сайт (`npm run build && npm run preview`), затем:

```bash
npm run test:e2e
```

## Публикация

1. Публичные настройки Supabase лежат в `.env.production`. Это адрес проекта и publishable-ключ: они видны в браузере любому посетителю, секрета в них нет.
2. Пуш в `main` запускает workflow `.github/workflows/pages.yml`: проверка, сборка и выкладка на GitHub Pages.
3. Новые миграции применяются к рабочей базе в SQL Editor Supabase или командой `npx supabase db push`.

## Push-уведомления (ещё не включены)

1. Сгенерировать ключи: `npx web-push generate-vapid-keys`.
2. Публичный ключ записать в `.env.production` как `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.
3. Секреты функции — по образцу `supabase/functions/.env.example`, затем `npx supabase secrets set --env-file …` и `npx supabase functions deploy send-push`.
4. В Vault базы добавить `push_function_url` и `push_webhook_secret` (подробности — в `supabase/migrations/20261113000002_push.sql`).

## Перед публичным запуском

- Перенести базу на сервер в России (ч. 5 ст. 18 152-ФЗ). Сейчас она в Ирландии.
- Подать уведомление об обработке персональных данных в Роскомнадзор (pd.rkn.gov.ru).
- Показать документы из `src/app/legal/` юристу.
- Подключить свою почту для писем (SMTP) и снова включить подтверждение почты.
