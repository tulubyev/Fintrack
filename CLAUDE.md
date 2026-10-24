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
artifacts/mobile       Android-приложение на Expo (E2.1): expo-router, свой React 19 — веб остаётся на React 18
lib/db                 схема Drizzle (источник правды по БД) и пул pg
lib/shared             общий код веба и приложения: деньги (D11), клиент API v1 с обновлением сессии; тесты — vitest
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
EXPO_PUBLIC_API_URL=http://<IP>:3000 pnpm --filter @workspace/mobile start   # Expo; бандл без телефона: run export:android

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
- Автокатегоризация — `services/categorization/` (E1.3): конвейер `createCategorizer()` (правила → мерчант → MCC → банк →
  ключевые слова), ручную разметку (`category_source = 'manual'`) автоматика не трогает. Нейросеть — последний шаг
  (`categorization/llm.ts`, очередь `categorize.llm`) через `llmProvider()` из `services/llm/provider.ts` (RouterAI, D2):
  в модель уходят только очищенные названия мерчантов, переводы людям и строки с именами — никогда. Флаг
  `LLM_CATEGORIZATION_ENABLED` на проде выключен, пока не закрыт вопрос 152-ФЗ.
- БД — системный PostgreSQL 16 (`172.28.0.1:5432`, база `fintrack_db`). Порт 5433 мёртв.

## Решения по продукту и безопасности (не отменять без запроса)

- Файлы живут в томе `fintrack_data` (`/data`): документы шифруются AES-256 ключом `ENCRYPTION_KEY`
  (смена ключа = потеря доступа к документам), фото профилей — `/api/profile/images/<файл>`.
- СНИЛС, ИНН, секрет 2FA и банковские токены шифруются в БД (`services/fieldEncryption.ts`, ключи из
  `ENCRYPTION_KEY` через HKDF), резервные коды 2FA хранятся HMAC-хешами. Шифрование — в слое `storage/`:
  прямые запросы к этим колонкам в обход storage вернут шифртекст.
- `ESIA_MOCK_MODE=true` в production запрещён — приложение не стартует. Реальная подпись ЕСИА
  (ГОСТ Р 34.10-2012, КриптоПро) не реализована.
- Секреты JWT без значений по умолчанию: `JWT_SECRET`, `JWT_REFRESH_SECRET`, `ENCRYPTION_KEY` обязательны.
- Сессии — таблица `auth_sessions` (`services/sessionService.ts`): access-токен JWT на 15 минут с `sid`,
  refresh-токен случайный, в БД только хеш, меняется при каждом обновлении; повтор старого токена отзывает сессию.
  Веб держит refresh-токен в HttpOnly-cookie (`/api/auth`), мобильный клиент получает его в теле ответа.
  Сброс пароля и «выйти на всех устройствах» отзывают все сессии.

## Запрещено

- Коммитить `.env*`, ключи, пароли, загруженные пользователями файлы и дампы (`uploads/`, `saveddata/`).
- На проде: `drizzle-kit push`, `docker compose down -v`, `docker system prune -a`,
  любые сиды и очистка таблиц. Схема меняется только миграциями из `lib/db/migrations` — по `docs/DEPLOY.md`
  («Миграции схемы»: `bash db-migrate.sh && bash deploy.sh`). CI падает, если схема изменена без миграции.
- Публиковать порты контейнеров на хост (`ports:`) — Docker обходит UFW.
- Возвращать Replit-зависимости (`@replit/*`, `REPL_*`, sidecar object storage).
