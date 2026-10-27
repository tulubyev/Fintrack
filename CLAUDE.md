# CLAUDE.md — FinTrack

Финтех-агрегатор для российского рынка: банковские счета, траты, бюджеты, сбережения,
AI-ассистент, вход через Госуслуги (ЕСИА). Перенесён из Replit на собственный VPS.

## Где что лежит

| | |
|---|---|
| GitHub | https://github.com/tulubyev/Fintrack |
| Локально | `~/Dropbox/DEV/fintrack` |
| VPS | `/var/www/fintrack` (90.156.168.149) |
| Прод | https://fin-wall.ru |
| Стек | pnpm workspace, Node 24, TypeScript 5.9, Express 4, React 18 + Vite, Expo SDK 58 (Android), Drizzle ORM, PostgreSQL 16, Docker + Traefik |

Инфраструктура VPS, реестр проектов и правила размещения — в `tulubyev/vps-server-infra`
(`docs/NEW-PROJECT.md`, `docs/Server_State.md`). Runbook этого проекта — `docs/DEPLOY.md`.
План развития продукта, спецификации эпиков и решения владельца — `docs/product/` (начинать с `README.md`).

## Как ведётся работа

Проект подключён к общей доске **DEV Control** (реестр — `tulubyev/dev-control`).

- Работа идёт по issues этого репозитория. Перед началом проверь, есть ли задача:
  `gh issue list --label agent:claude` — задачи, назначенные Claude.
- Каждая задача делается в отдельной ветке (`feat/<номер>-кратко`, `fix/<номер>-кратко`)
  и завершается PR с `Closes #<номер>` в описании — тогда карточка на доске сама
  уйдёт в Done после merge.
- Если задача заблокирована (нужен ответ, доступ, решение) — комментарий в issue
  с вопросом и метка `blocked`, не гадать.
- В PR: что сделано, как проверено, что осталось.
- Секреты только в `.env` (в git не попадают), в `.env.example` — имена переменных.

## Структура

```
artifacts/api-server   Express API (бандл esbuild → dist/index.mjs)
artifacts/fintrack     React SPA (Vite → dist/public)
artifacts/site         публичный сайт fin-wall.ru на Astro (E1.8): статический HTML, приложение — app.fin-wall.ru (D21)
artifacts/mobile       приложение на Expo для Android и iOS (E2.1, E3.1): expo-router, свой React 19 — веб остаётся на React 18
lib/db                 схема Drizzle (источник правды по БД) и пул pg
lib/shared             общий код веба, приложения и сайта: деньги (D11), клиент API v1 с обновлением сессии,
                       инструкции «как скачать выписку» (bank-guides — мастер импорта и /banks на сайте); тесты — vitest
lib/statement-parsers  разбор выписок банков (E1.2): CSV/XLSX → ParsedStatement, без БД; golden-тесты на синтетических фикстурах
lib/api-spec           OpenAPI + orval; lib/api-zod, lib/api-client-react — сгенерированное
api.Dockerfile, web.Dockerfile, docker-compose.prod.yml, deploy.sh, db-migrate.sh   деплой и миграции
```

## Команды

```bash
pnpm install
pnpm run build        # typecheck всего workspace + сборка (то же гоняет CI)
pnpm run typecheck
TEST_DATABASE_URL=postgres://…/fintrack_test pnpm --filter @workspace/api-server run test  # отдельная база: тесты пишут в неё

# разработка (нужны .env с DATABASE_URL, JWT_SECRET, ENCRYPTION_KEY, SMS_RU_API_KEY, BEGET_SMTP_*)
PORT=3000 pnpm --filter @workspace/api-server run dev
PORT=5173 pnpm --filter @workspace/fintrack run dev     # /api проксируется на localhost:3000
pnpm --filter @workspace/site run dev                    # публичный сайт (Astro, нужен Node ≥ 22.23 — как в CI, Node 24)
EXPO_PUBLIC_API_URL=http://<IP>:3000 pnpm --filter @workspace/mobile start   # Expo Go на iPhone и Android; бандл без телефона: run export:android

# схема БД: правим lib/db/src/schema, затем генерируем миграцию и коммитим её вместе со схемой
pnpm --filter @workspace/db run generate                  # SQL в lib/db/migrations — ревью в PR
DATABASE_URL=... pnpm --filter @workspace/db run migrate  # применить локально; на проде — по docs/DEPLOY.md
```

## Сборка и выкатка

- На VPS ничего не собираем. Образы `ghcr.io/tulubyev/fintrack-{api,web}` собирает GitHub Actions
  (`.github/workflows/build-images.yml`) при пуше в `main`; на сервере `bash db-migrate.sh && bash deploy.sh`.
- CI (`ci.yml`) на каждый PR гоняет `pnpm run build`, проверку миграций и тесты API (`artifacts/api-server/tests`) —
  красный CI блокирует merge. Новый эндпоинт с данными пользователя — сразу тест «B не видит и не меняет данные A».
- Android-приложение собирается в GitHub Actions без облака Expo (D13, `.github/workflows/mobile-android.yml`):
  `expo prebuild` + Gradle, APK — в артефактах запуска. Папки `android/` и `ios/` генерируются и в git не хранятся;
  нативные настройки — только через `app.config.ts` и config-плагины. Ключ подписи — секреты `ANDROID_KEYSTORE_*`.
  iOS (D17): разработка — в Expo Go, бета — TestFlight через macOS-раннер (E3.1); в Expo Go нет SQLCipher и «Поделиться» —
  код обязан работать и без них, а проверяются они в сборках. Новые нативные модули — только с поддержкой обеих платформ.
- Контейнеры `fintrack-api`, `fintrack-worker`, `fintrack-web` в сети `traefik-public`, без `ports:`, маршруты — Traefik labels
  в `docker-compose.prod.yml`. Выкатка: `bash db-migrate.sh && bash deploy.sh`.
- Фоновые задачи — pg-boss (схема `pgboss`, владелец `fintrack_user`), модуль `artifacts/api-server/src/jobs`:
  новая задача — в `jobs/definitions.ts`; API ставит задачи (`enqueue`), выполняет их воркер (`WORKER_MODE=only`).
  Обработчики должны быть повторяемыми: задача может выполниться ещё раз после сбоя или перезапуска.
- Продуктовые события — таблица `product_events` (решение D10, данные не уходят третьим лицам): сервер — `track()` из
  `services/analytics.ts`, веб — `track()` из `artifacts/fintrack/src/lib/analytics.ts`, приём — `POST /api/v1/events`.
  Новое событие сначала добавляется в `EVENT_NAMES`; ПДн в свойства не кладём (валидатор их вырезает). Хранение 400 дней.
- In-app уведомления — таблица `notifications`, создаются только через `notify()` из `services/notificationService.ts`
  (тип из `NOTIFICATION_TYPES`, `deepLink` — путь SPA, повтор одного события гасится `dedupKey`). Колокольчик — `features/notifications`.
  Важные уведомления дублируются письмом через `emailNotification()` из `services/notificationEmailService.ts` (решение D19):
  только на подтверждённый e-mail, при включённом `users.email_notifications`; повтор гасит `notifications.emailed_at`.
  Настройки по группам (push / письмо), тихие часы и «скрывать суммы» — `services/notificationPrefs.ts` (E2.2): новый тип
  уведомления добавляется в группу `PREF_GROUPS`, иначе push по нему не уйдёт. Push-токен устройства хранится в его сессии
  (`auth_sessions.push_token`, зашифрован, `services/pushTokens.ts`) и стирается при отзыве сессии.
- Автокатегоризация — `services/categorization/` (E1.3): конвейер `createCategorizer()` (правила → мерчант → MCC → банк →
  ключевые слова), ручную разметку (`category_source = 'manual'`) автоматика не трогает. Нейросеть — последний шаг
  (`categorization/llm.ts`, очередь `categorize.llm`) через `llmProvider()` из `services/llm/provider.ts` (RouterAI, D2):
  в модель уходят только очищенные названия мерчантов, переводы людям и строки с именами — никогда. Флаг
  `LLM_CATEGORIZATION_ENABLED` на проде выключен, пока не закрыт вопрос 152-ФЗ.
- Импорт выписок (E1.2) — `services/imports/` и `/api/v1/imports`: файл хранится зашифрованным в `IMPORTS_DIR` (`/data/imports`,
  ключ HKDF `fintrack:imports`) 30 дней (D8, задача `cleanup.imports`); разбор — задача `import.parse` в воркере через
  `@workspace/statement-parsers`, строки предпросмотра — `import_rows`. Исходные ячейки (`import_rows.raw`) наружу не отдаются.
  Коммит — задача `import.commit`, одной транзакцией; операции импорта несут `import_batch_id` и ключ `dedup_hash`/`dedup_seq`
  (уникальный индекс `tx_dedup_uq`) — вставлять операции импорта в обход `services/imports/commit.ts` нельзя.
- Синхронизация приложения — `GET /api/v1/sync` (`services/syncService.ts`, E2.1-T4): курсор по номеру транзакции `sync_xid`
  (триггер `sync_touch` на счетах, операциях, категориях и их настройках, бюджетах, целях, взносах, регулярных платежах, правилах),
  а не по `updated_at`. Новая синхронизируемая таблица — колонка `sync_xid`, индекс `(user_id, sync_xid, id)`, триггер и источник
  в `SOURCES`; удаление только мягкое (`deleted_at`), иначе приложение не узнает об удалении.
- БД — системный PostgreSQL 16 (`172.28.0.1:5432`, база `fintrack_db`). Порт 5433 мёртв.

## Решения по продукту и безопасности (не отменять без запроса)

- Удаление аккаунта (E1.0-T6, 152-ФЗ) — `DELETE /api/v1/me` с паролем, `services/accountDeletion.ts`: строки удаляет каскад
  внешних ключей от `users`, документы и файлы (документы, выписки, фото профиля) — явно. Новая таблица с данными пользователя —
  внешний ключ на `users` с `onDelete: "cascade"` (ссылка администратора — `"set null"`), иначе упадёт `tests/accountDeletion.test.ts`.
- Файлы живут в томе `fintrack_data` (`/data`): документы шифруются AES-256 ключом `ENCRYPTION_KEY`
  (смена ключа = потеря доступа к документам), фото профилей — `/api/profile/images/<файл>`.
- СНИЛС, ИНН, секрет 2FA и банковские токены шифруются в БД (`services/fieldEncryption.ts`, ключи из
  `ENCRYPTION_KEY` через HKDF), резервные коды 2FA хранятся HMAC-хешами. Шифрование — в слое `storage/`:
  прямые запросы к этим колонкам в обход storage вернут шифртекст.
- `ESIA_MOCK_MODE=true` в production запрещён — приложение не стартует. Реальная подпись ЕСИА
  (ГОСТ Р 34.10-2012, КриптоПро) не реализована.
- Секреты JWT без значений по умолчанию: `JWT_SECRET`, `JWT_REFRESH_SECRET`, `ENCRYPTION_KEY` обязательны.
- Сессии — таблица `auth_sessions` (`services/sessionService.ts`): access-токен JWT на 15 минут с `sid`,
  refresh-токен случайный, в БД только хеш, меняется при каждом обновлении. Повтор заменённого токена в течение минуты
  (потерянный ответ, параллельная вкладка) получает ту же новую пару — она хранится зашифрованной ключом из старого
  токена (`replay_token_enc`); позже повтор отзывает сессию.
  Веб держит refresh-токен в HttpOnly-cookie (`/api/auth`), мобильный клиент получает его в теле ответа.
  Сброс пароля и «выйти на всех устройствах» отзывают все сессии.
- Приложение (`artifacts/mobile/src/auth`): refresh-токен и хеш PIN (scrypt) — в SecureStore, access-токен — только в памяти;
  5 неверных PIN подряд стирают вход, уход в фон дольше 5 минут блокирует приложение.
- Локальные данные приложения (`artifacts/mobile/src/data`, E2.1-T5): SQLite с SQLCipher, ключ — в SecureStore; запись без сети
  идёт через очередь `outbox` с клиентскими id. Явный выход и 5 неверных PIN стирают базу; истёкшая сессия сохраняет неотправленное
  до входа того же пользователя. Экраны читают данные через `store` и `useLocal`, пишут через `store.mutate`
  (для операций — `data/transactions.ts`), а не ходят в API напрямую. Исключение — импорт выписки (`data/imports.ts`,
  E2.1-T9): он идёт через серверный мастер `/api/v1/imports`, «Поделиться» — `expo-share-intent` в корневом `_layout`.
- Навигация приложения (E2.1-T6): пути экранов повторяют сайт (`/budgets/:id`, `/accounts/:id`…), ссылки — `fintrack://…`
  и `https://fin-wall.ru/app/…` (`lib/links.ts`; `assetlinks.json` — из `ANDROID_CERT_SHA256`, отладочный ключ туда не ставить).
  Новый экран — файл в `src/app`, заголовок — в `STACK_SCREENS`, компоненты — из `src/ui/kit.tsx`, цвета — только из `src/ui/theme.ts`.
- Биометрия в приложении (D20): приложения не собирают биометрию — вход по отпечатку или Face ID выключен по умолчанию,
  включается `MOBILE_BIOMETRICS_ENABLED=true` или супер-администратором («Настройки приложения», таблица `app_settings`,
  `services/appSettings.ts`); приложение спрашивает `GET /api/v1/app-config` и без разрешения биометрию не предлагает.
- Фирменный стиль (E1.8-T8) — `docs/brand` (токены, знак «Грань» — `03-logo.md`, Onest). Цвета — только токены: веб `src/index.css` + Tailwind,
  сайт `src/styles/global.css`, приложение `src/ui/theme.ts`; значения у трёх одинаковые — менять вместе. Шрифт раздаём сами, без Google Fonts.
  Темы три — светлая, тёмная и кремово-золотая (`.dark` / `.cream` в вебе, `data-theme` на сайте, `palette.cream` в приложении):
  новый цвет добавляется во все три, источник — `docs/brand/tokens.json` и `scripts/build.mjs` (контраст в `contrast-report.md`).

## Запрещено

- Коммитить `.env*`, ключи, пароли, загруженные пользователями файлы и дампы (`uploads/`, `saveddata/`).
- На проде: `drizzle-kit push`, `docker compose down -v`, `docker system prune -a`,
  любые сиды и очистка таблиц. Схема меняется только миграциями из `lib/db/migrations` — по `docs/DEPLOY.md`
  («Миграции схемы»: `bash db-migrate.sh && bash deploy.sh`). CI падает, если схема изменена без миграции.
- Публиковать порты контейнеров на хост (`ports:`) — Docker обходит UFW.
- Возвращать Replit-зависимости (`@replit/*`, `REPL_*`, sidecar object storage).
