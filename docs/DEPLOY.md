# Развёртывание FinTrack на VPS

Документ по `vps-server-infra/docs/NEW-PROJECT.md`, Вариант A (полный Docker).

| Параметр | Значение |
|---|---|
| Домен | `fin-wall.ru` (DNS A → 90.156.168.149) |
| Путь на VPS | `/var/www/fintrack/` (git clone по deploy key `~/.ssh/fintrack_deploy`) |
| Контейнеры | `fintrack-api` (Express, :3000), `fintrack-web` (nginx, :8080) — порты внутренние |
| Образы | `ghcr.io/tulubyev/fintrack-api`, `ghcr.io/tulubyev/fintrack-web` (собирает GitHub Actions) |
| БД | `fintrack_db` в системном PostgreSQL 16, `172.28.0.1:5432` (порт 5433 мёртв) |
| Данные на диске | том `fintrack_data` → `/data` (зашифрованные документы, фото профилей) |
| Память | api 512 МБ + web 64 МБ |

## 0. Перед первым запуском

- [ ] DNS: `fin-wall.ru` → 90.156.168.149 (`dig +short fin-wall.ru`).
- [ ] В `main` прошёл workflow **Build images** (`gh run list --workflow build-images.yml`).
- [ ] Пакеты GHCR `fintrack-api` и `fintrack-web` доступны серверу: либо публичные
      (Package settings → Change visibility), либо `docker login ghcr.io` на VPS.
- [ ] Порты контейнеров наружу не публикуются — проверка (должен остаться только traefik):
      `docker ps --format '{{.Names}}\t{{.Ports}}' | grep -E '0\.0\.0\.0|\[::\]'`

## 1. Роль в PostgreSQL и права на старую базу

База `fintrack_db` уже существует (данные из Replit-версии). Приложение ходит под отдельной
ролью `fintrack_user`, владельцем таблиц остаётся `tulubyev` (как у `lms_app_user` в Mentingo).
Роль `fintrack_user` на сервере уже была создана раньше — поэтому пароль задаётся через `ALTER ROLE`.
Все шаги ниже делайте **в одной сессии терминала**: переменная `$DBPASS` нужна до шага 3.

```bash
mkdir -p ~/db_backups && sudo -u postgres pg_dump -Fc fintrack_db > ~/db_backups/fintrack_db_$(date +%F).dump

DBPASS=$(openssl rand -hex 16)
sudo -u postgres psql -d fintrack_db <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'fintrack_user') THEN CREATE ROLE fintrack_user LOGIN; END IF;
END \$\$;
ALTER ROLE fintrack_user WITH LOGIN PASSWORD '$DBPASS';
GRANT CONNECT ON DATABASE fintrack_db TO fintrack_user;
GRANT USAGE ON SCHEMA public TO fintrack_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO fintrack_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO fintrack_user;
ALTER DEFAULT PRIVILEGES FOR ROLE tulubyev IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO fintrack_user;
ALTER DEFAULT PRIVILEGES FOR ROLE tulubyev IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO fintrack_user;
SQL
```

Проверять подключение нужно **из контейнера** в сети `traefik-public`: `pg_hba.conf` пускает только
`172.28.0.0/16`, а `psql` прямо с хоста приходит с публичного IP (90.156.168.149) и получает
`no pg_hba.conf entry`. По той же причине не работает SSH-туннель к базе с рабочей машины.

```bash
docker run --rm --network traefik-public -e PGPASSWORD=$DBPASS postgres:16-alpine \
  psql -h 172.28.0.1 -U fintrack_user -d fintrack_db -c 'select count(*) from users'
```

## 2. Код на сервере и сверка схемы

Репозиторий приватный — клонируется по read-only deploy key (как marketsat).

```bash
ssh-keygen -t ed25519 -N "" -C "fintrack-deploy@vps" -f ~/.ssh/fintrack_deploy
cat ~/.ssh/fintrack_deploy.pub   # → GitHub: Settings → Deploy keys → Add, без write access

sudo mkdir -p /var/www/fintrack && sudo chown tulubyev: /var/www/fintrack
cd /var/www/fintrack
GIT_SSH_COMMAND="ssh -i ~/.ssh/fintrack_deploy -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new" \
  git clone git@github.com:tulubyev/Fintrack.git .
git config core.sshCommand "ssh -i ~/.ssh/fintrack_deploy -o IdentitiesOnly=yes"
```

Источник правды по схеме — `lib/db/src/schema/index.ts`, изменения схемы — SQL-миграции в `lib/db/migrations`.
Проверка и применение — по п. 5, «Миграции схемы».

**Старые файлы.** Файлы из Replit в новый том не попали. Если в таблице `documents` есть записи,
их зашифрованные файлы (`saveddata/*.enc`) нужно скопировать в том (`/data/documents`), причём
`ENCRYPTION_KEY` должен остаться прежним — иначе документы не расшифровать.
Ссылки на фото вида `/uploads/…` теперь не работают (новые фото — `/api/profile/images/…`):
`UPDATE users SET profile_image_url = NULL WHERE profile_image_url LIKE '/uploads/%';`

## 3. Секреты и запуск

В той же сессии терминала, где задан `$DBPASS`:

```bash
cd /var/www/fintrack
[ -n "$DBPASS" ] || echo "СТОП: DBPASS пуст"
cp .env.example .env && chmod 600 .env
sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$(openssl rand -hex 32)|;
        s|^JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=$(openssl rand -hex 32)|;
        s|^SESSION_SECRET=.*|SESSION_SECRET=$(openssl rand -hex 32)|;
        s|^ENCRYPTION_KEY=.*|ENCRYPTION_KEY=$(openssl rand -hex 32)|;
        s|CHANGE_ME|$DBPASS|" .env
nano .env          # SMS_RU_API_KEY, BEGET_SMTP_USER, BEGET_SMTP_PASSWORD …

# проверка подключения ровно с тем DATABASE_URL, что в .env:
docker run --rm --network traefik-public --env-file .env postgres:16-alpine \
  sh -c 'psql "$DATABASE_URL" -c "select count(*) from users"'

bash deploy.sh
```

Секреты генерируются так: `openssl rand -hex 32`. `ENCRYPTION_KEY` сохраните и **вне VPS** —
без него документы не открыть. `ESIA_MOCK_MODE` в `.env` не добавляйте: в production
приложение с ним не стартует.

Сертификат Let's Encrypt Traefik выпустит сам в течение ~30 секунд после появления контейнеров.

## 4. Проверка

```bash
docker compose -f docker-compose.prod.yml ps          # api, worker и web — healthy
curl -s https://fin-wall.ru/api/healthz                # {"status":"ok"}
curl -sI https://fin-wall.ru/ | head -3                # 200, text/html
docker logs --tail 50 fintrack-api                     # ошибок валидации конфигурации нет
docker logs --tail 20 fintrack-worker                  # «Фоновые задачи: режим only, очередей …»
```

## 5. Обновление и откат

- Обновление: пуш в `main` → дождаться **Build images** → на VPS
  `cd /var/www/fintrack && git pull && bash db-migrate.sh && bash deploy.sh`.
  Без новых миграций `db-migrate.sh` ничего не меняет, поэтому его можно запускать всегда.
- Откат: `IMAGE_TAG=sha-<полный sha> bash deploy.sh` (теги образов — `latest` и `sha-<полный sha>`).
- Изменение схемы БД — только миграциями, см. «Миграции схемы» ниже.

### Миграции схемы

Схема меняется SQL-миграциями из `lib/db/migrations` (`drizzle-kit generate` → ревью SQL в PR → применение).
Приложение работает под `fintrack_user` и таблицами не владеет, поэтому скрипт в образе API только
**печатает** SQL, а выполняет его `psql` от `postgres` с ролью `tulubyev` — пароль роли не нужен.
Журнал применённых миграций — таблица `drizzle.__drizzle_migrations` (тот же формат, что у `migrate()` из
drizzle-orm, которым миграции применяются локально и в CI).

Всё делает `db-migrate.sh` в корне репозитория (рядом с `deploy.sh`): SQL берётся из **нового** образа API,
перед применением делается бэкап в `~/db_backups`, любая ошибка останавливает скрипт с ненулевым кодом —
поэтому `deploy.sh` после неудачи не запускается.

**Однократно — переход на миграции** (таблицы уже созданы раньше через `drizzle-kit push`):

```bash
cd /var/www/fintrack && git pull
bash db-migrate.sh baseline
```

Скрипт делает бэкап, разворачивает базовую миграцию во временной базе и сравнивает её схему со схемой
`fintrack_db`. При любом различии он выводит `diff` и останавливается, журнал не создаётся — пришлите вывод.
Затем проверяет, что у `tulubyev` есть право `CREATE` на базу, и помечает базовую миграцию применённой
(SQL самой миграции не выполняется). Временная база удаляется в любом случае.

**При каждой выкатке, где есть новая миграция** (в описании PR указано «есть миграция»):

```bash
cd /var/www/fintrack && git pull
bash db-migrate.sh && bash deploy.sh
```

`db-migrate.sh` показывает SQL ожидающих миграций, делает бэкап и применяет их одной транзакцией
(при ошибке ничего не меняется). После применения он проверяет, что у `fintrack_user` есть `SELECT/INSERT/UPDATE/DELETE`
на все таблицы и `USAGE` на последовательности схемы `public`: если default privileges не сработали, выкатка
останавливается, а скрипт печатает команду `GRANT`, после которой можно запускать `deploy.sh`. Без ожидающих миграций он ничего не трогает. `bash db-migrate.sh status`
показывает, что применено и что ждёт.

Миграции пишутся совместимыми со старым кодом (добавить колонку или таблицу — да, удалить или
переименовать — отдельной выкаткой после того, как код перестал их использовать), поэтому между
применением миграции и `deploy.sh` сервис продолжает работать.

### Фоновые задачи (воркер)

Разбор выписок, курсы ЦБ, напоминания и очистку выполняет контейнер `fintrack-worker`: тот же образ, что у API,
с `WORKER_MODE=only`, без HTTP и портов. API работает с `WORKER_MODE=off` и только ставит задачи в очередь.
Очередь — [pg-boss](https://github.com/timgit/pg-boss) в схеме `pgboss` базы `fintrack_db` (решение D9).

- **Схема `pgboss` принадлежит `fintrack_user`**: pg-boss сам создаёт и обновляет свои таблицы. Остальная
  база для приложения по-прежнему только DML. Схему создаёт `db-migrate.sh` (идемпотентно, при каждом запуске),
  поэтому выкатка — всегда `bash db-migrate.sh && bash deploy.sh`.
- **Здоровье**: воркер раз в 30 с проверяет базу и обновляет `/tmp/fintrack-worker.alive`; healthcheck
  считает его нездоровым, если файлу больше 90 с. `deploy.sh` ждёт `healthy` у всех трёх контейнеров.
- **Остановка**: по SIGTERM воркер перестаёт брать задачи и ждёт текущие до 20 с (`stop_grace_period: 30s`).
  Незавершённая задача вернётся в очередь по таймауту и выполнится снова — обработчики пишутся повторяемыми.
- **Повторы**: упавшая задача повторяется 3 раза с паузой 2, 4, 8 с, затем помечается `failed`.
- **Расписание**: `cleanup.sessions` (04:00 МСК) — сессии входа, истёкшие или отозванные больше 30 дней назад;
  `cleanup.events` (04:15 МСК) — продуктовые события старше 400 дней;
  `cleanup.notifications` (04:30 МСК) — прочитанные уведомления старше 90 дней;
  `fx.rates.daily` (16:00 МСК) — курсы ЦБ на сегодня и завтра (`https://www.cbr.ru/scripts/XML_daily.asp`),
  затем досчёт `amount_rub` у валютных операций. Пока в `fx_rates` меньше 500 дат, она же ставит
  `fx.rates.backfill` — историю за 3 года (по запросу в день с паузой 0,5 с, уже загруженные даты пропускаются).
- **Запустить задачу вручную**: `docker exec fintrack-api node dist/scripts/enqueue-job.mjs fx.rates.backfill '{"days":30}'`
  (ставит в очередь, выполнит воркер). Курсы проверить:
  `sudo -u postgres psql -d fintrack_db -c "select date, count(*) from fx_rates group by 1 order by 1 desc limit 5"`.
- **Что в очереди**: `sudo -u postgres psql -d fintrack_db -c "select name, state, count(*) from pgboss.job group by 1,2"`;
  расписания — `select name, cron, timezone from pgboss.schedule`.
- **Память**: лимит воркера 256 МБ; с разбором PDF-выписок (E1.2) поднимется до 512 МБ — проверить `free -h`.

### Шифрование полей (однократно, при выкатке шифрования ПДн)

СНИЛС, ИНН, секрет 2FA и банковские токены хранятся зашифрованными. Колонки нужно расширить до выкатки,
а старые открытые значения перешифровать скриптом в контейнере. Код читает и старые значения, поэтому
между шагами 3 и 4 сервис работает.

```bash
# 1. бэкап
sudo -u postgres pg_dump -Fc fintrack_db > ~/db_backups/fintrack_db_$(date +%F_%H%M).dump
# 2. расширить колонки от владельца таблиц
sudo -u postgres psql -d fintrack_db -c "SET ROLE tulubyev; ALTER TABLE users ALTER COLUMN snils TYPE varchar(255), ALTER COLUMN inn TYPE varchar(255), ALTER COLUMN two_factor_secret TYPE text;"
# 3. выкатить код
cd /var/www/fintrack && git pull && bash deploy.sh
# 4. перешифровать существующие данные (сначала посмотреть, сколько строк затронет)
docker exec fintrack-api node dist/scripts/encrypt-fields.mjs --dry-run
docker exec fintrack-api node dist/scripts/encrypt-fields.mjs
```

После шага 4 откат на образ без шифрования ломает вход с 2FA: только вместе с восстановлением бэкапа.

### Сессии входа (однократно, при выкатке #24)

Сессии хранятся в таблице `auth_sessions`; код без неё не может выдать токены, поэтому таблица создаётся
до выкатки. Права для `fintrack_user` придут сами через `ALTER DEFAULT PRIVILEGES` из п. 1.

```bash
# 1. бэкап
sudo -u postgres pg_dump -Fc fintrack_db > ~/db_backups/fintrack_db_$(date +%F_%H%M).dump
# 2. создать таблицу от владельца
sudo -u postgres psql -d fintrack_db -v ON_ERROR_STOP=1 <<'SQL'
SET ROLE tulubyev;
CREATE TABLE auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL CONSTRAINT auth_sessions_user_id_users_id_fk REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_hash varchar(64) NOT NULL CONSTRAINT auth_sessions_refresh_token_hash_unique UNIQUE,
  previous_token_hash varchar(64),
  rotated_at timestamp,
  device_name varchar(200),
  ip_address varchar(64),
  created_at timestamp NOT NULL DEFAULT now(),
  last_used_at timestamp NOT NULL DEFAULT now(),
  expires_at timestamp NOT NULL,
  revoked_at timestamp
);
CREATE INDEX auth_sessions_user_idx ON auth_sessions (user_id);
CREATE INDEX auth_sessions_previous_token_idx ON auth_sessions (previous_token_hash);
SQL
# проверить права приложения
# каждая строка должна быть t (при перечислении через запятую функция проверяет «хотя бы одно»)
sudo -u postgres psql -d fintrack_db -c "SELECT p, has_table_privilege('fintrack_user', 'auth_sessions', p) FROM unnest(ARRAY['SELECT','INSERT','UPDATE']) AS p;"
# 3. выкатить код
cd /var/www/fintrack && git pull && bash deploy.sh
```

Старые 24-часовые токены продолжают работать до истечения, потом пользователь входит заново — уже с сессией.
Откат кода безопасен: старый код таблицу не трогает.

### Ссылки в приложение (App Links, E2.1-T6)

Ссылка `https://fin-wall.ru/app/<путь>` открывает экран приложения, а без приложения — ту же страницу сайта
(nginx отдаёт редирект `/app/…` → `/…`). Чтобы Android открывал такие ссылки сразу в приложении, без выбора,
домен подтверждается файлом `/.well-known/assetlinks.json`. Его собирает web-контейнер при старте
(`deploy/40-app-links.sh`) из переменной `ANDROID_CERT_SHA256` в `.env`.

```bash
# отпечаток ключа, которым подписан APK из GitHub Actions (секреты ANDROID_KEYSTORE_*)
apksigner verify --print-certs fintrack-apk-<N>.apk | grep SHA-256
# в .env (формат AA:BB:…, несколько ключей — через запятую), затем
docker compose -f docker-compose.prod.yml up -d web
curl -s https://fin-wall.ru/.well-known/assetlinks.json
```

Пусто — файл отдаёт 404, ссылки открывают сайт; `fintrack://…` работает всегда. Отпечаток отладочного ключа не
ставить: им может подписаться любое приложение. Для iOS — `APPLE_APP_ID=TEAMID.ru.finwall.app` (когда будет сборка).

### Публичный сайт и app-домен (E1.8, D21)

После включения `fin-wall.ru` отдаёт публичный сайт, веб-приложение переезжает на `app.fin-wall.ru`. Всё в том же web-контейнере, режим переключает переменная `SITE_ENABLED`. До включения контейнер работает по-старому.

1. **DNS.** У регистратора — A-запись `app.fin-wall.ru` → `90.156.168.149`. Проверить: `dig +short app.fin-wall.ru`.
2. **`.env`:**
   ```bash
   SITE_ENABLED=true
   APP_HOST=app.fin-wall.ru
   FRONTEND_URL=https://app.fin-wall.ru,https://fin-wall.ru   # первый адрес — для ссылок в письмах
   ```
3. **Выкатка:** `bash deploy.sh`. Скрипт видит `SITE_ENABLED=true` и подключает `docker-compose.site.yml` — маршруты Traefik для app-домена (веб и `/api`). Сертификат для `app.fin-wall.ru` Traefik выпустит сам.
4. **Проверка маршрутов:**
   ```bash
   bash deploy/test-site-routing.sh https://fin-wall.ru
   ```
   Сайт на основном домене; старые ссылки (`/transactions`, `/import/…`, `/app/…`, ссылки из писем) → `301` на `app.fin-wall.ru`; приложение на app-домене закрыто от индексации.
5. **Откат:** `SITE_ENABLED=false` и `bash deploy.sh` — приложение снова на основном домене.

Что важно знать:
- `/api` работает на обоих доменах. Установленные мобильные приложения ходят на `fin-wall.ru/api` и продолжают работать.
- `/.well-known/assetlinks.json` остаётся на `fin-wall.ru`: на этот хост указывают App Links приложения.
- Веб-пользователи после переезда один раз войдут заново: токены привязаны к домену. Предупредить заранее.

## 6. Бэкапы

- **База**: покрыта ночным `pg-backup.sh` из vps-server-infra (каждая база кластера отдельным дампом,
  копии шифруются в S3) — отдельно настраивать не нужно.
- **Том `fintrack_data`** (документы, фото) `pg-backup.sh` не копирует. Скрипт `deploy/backup-data.sh`
  складывает архив в `/var/backups/fintrack` (14 дней). Cron от root:
  ```
  30 3 * * * /var/www/fintrack/deploy/backup-data.sh
  ```
  Архивы документов зашифрованы `ENCRYPTION_KEY`, но выносите их с сервера так же, как копии БД.

## 7. Записи в vps-server-infra

После первого успешного запуска обновить `docs/Projects.md`, `docs/Server_State.md`
(строка в архитектуре, пути, том, бэкап) и `projects.yml` в `tulubyev/dev-control`.

## 8. Известные ограничения

- Вход через Госуслуги: реальная подпись ГОСТ (КриптоПро) не реализована, mock в production запрещён.
- Подключения банков и приёма платежей нет: код удалён до эпиков E3.5 и E2.8 (решение D15). Таблица `bank_connections` сохранена.
