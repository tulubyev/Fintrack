# FinTrack

Финансовый агрегатор «Управляй своими финансами осмысленно» для российского рынка:
банковские счета, операции, бюджеты, накопления и документы в одном личном кабинете.

## Возможности

- Подключение банков и агрегация счетов и операций (реализованы клиенты API Сбербанка
  и Тинькофф), дашборд со статистикой и категориями трат.
- Бюджеты и цели накоплений.
- Загрузка и проверка документов пользователя с шифрованием и одноразовыми токенами
  просмотра; хранение в объектном хранилище.
- Вход через Госуслуги (ЕСИА), есть mock-режим для разработки.
- Подтверждение телефона и email (SMS через sms.ru, письма через SMTP),
  двухфакторная аутентификация.
- AI-ассистент через OpenRouter: чат и рекомендации.
- Платежи через ЮKassa и CloudPayments.
- Админ-панель: пользователи, проверка документов, мониторинг системы, управление API.
- Отдельная веб-презентация продукта (`artifacts/fintrack-deck`).

## Стек

- **Монорепо:** pnpm workspaces, TypeScript 5.9, Node.js 24.
- **API:** Express 5, JWT, PostgreSQL + Drizzle ORM, Zod; сборка esbuild.
- **Клиент:** React, Vite, Tailwind CSS, shadcn/ui, Wouter.
- **Контракты API:** OpenAPI-спецификация, генерация хуков и Zod-схем через Orval.

## Структура репозитория

```
artifacts/
  api-server/       Express API: src/routes, src/services, src/storage, config/
  fintrack/         веб-клиент
  fintrack-deck/    презентация продукта (слайды)
  mockup-sandbox/   песочница для макетов
lib/
  db/               схема БД и drizzle-kit
  api-spec/         OpenAPI-спецификация и конфигурация Orval
  api-zod/          сгенерированные Zod-схемы
  api-client-react/ сгенерированный клиент API для React
scripts/            служебные скрипты, post-merge.sh
.migration-backup/  код и документы версии до переноса в монорепо
```

## Запуск локально

Используется только pnpm (скрипт `preinstall` блокирует npm и yarn).

```bash
pnpm install
pnpm --filter @workspace/api-server run dev   # API
pnpm --filter @workspace/fintrack run dev     # веб-клиент (нужны PORT и BASE_PATH)
```

Сборка, проверка типов, кодогенерация и схема БД:

```bash
pnpm run build                                  # typecheck + сборка всех пакетов
pnpm run typecheck
pnpm --filter @workspace/api-spec run codegen   # хуки и Zod-схемы из OpenAPI
pnpm --filter @workspace/db run push            # изменения схемы БД (только dev)
```

## Переменные окружения

Файла `.env.example` нет; переменные взяты из кода (`artifacts/api-server/config/environment.ts`
и др.).

| Переменная | Назначение |
|---|---|
| `DATABASE_URL`, `MAX_DB_CONNECTIONS` | PostgreSQL |
| `NODE_ENV`, `PORT`, `BASE_URL`, `API_VERSION`, `APP_VERSION`, `LOG_LEVEL` | режим, порт и параметры API |
| `BASE_PATH` | базовый путь веб-клиента (обязателен вместе с `PORT`) |
| `JWT_SECRET`, `JWT_REFRESH_SECRET`, `ENCRYPTION_KEY` | токены и шифрование данных |
| `ESIA_CLIENT_ID`, `ESIA_SECRET_KEY`, `ESIA_REDIRECT_URI`, `ESIA_CERTIFICATE_PATH`, `ESIA_PRIVATE_KEY_PATH`, `ESIA_MOCK_MODE` | вход через Госуслуги |
| `SBERBANK_CLIENT_ID`, `SBERBANK_CLIENT_SECRET`, `TINKOFF_CLIENT_ID`, `TINKOFF_CLIENT_SECRET` | API банков |
| `YOOKASSA_SHOP_ID`, `YOOKASSA_SECRET_KEY`, `CLOUDPAYMENTS_PUBLIC_ID`, `CLOUDPAYMENTS_SECRET_KEY` | платежи |
| `OPENROUTER_API_KEY` | AI-ассистент |
| `SMS_RU_API_KEY` | SMS |
| `BEGET_SMTP_HOST`, `BEGET_SMTP_PORT`, `BEGET_SMTP_USER`, `BEGET_SMTP_PASSWORD` | почта |
| `PRIVATE_OBJECT_DIR` | каталог объектного хранилища для документов |
| `REPL_ID` | признак запуска в Replit |

## Деплой

Сейчас проект запускается и публикуется в Replit (`.replit`, `artifact.toml` у каждого
пакета в `artifacts/`). Конфигурации для VPS пока нет.

## Статус

Ждёт переноса из Replit на VPS.

## Документация

- [replit.md](replit.md) — команды и стек монорепо.
- [.migration-backup/README.md](.migration-backup/README.md),
  [.migration-backup/replit.md](.migration-backup/replit.md) — описание продукта и
  архитектуры версии до миграции.
- [.migration-backup/docs/](.migration-backup/docs/) — ЕСИА, хранилище, админ-панель,
  планы разработки.
- [CLAUDE.md](CLAUDE.md) — порядок работы по issues.

Контакт: alt@in2sys.fr
