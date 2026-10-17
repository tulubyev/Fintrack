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

Источник правды по схеме — `lib/db/src/schema/index.ts`. Сверка выполняется на VPS из одноразового
контейнера (репозиторий монтируется только для чтения, в `/var/www/fintrack` ничего не появляется).
Под `fintrack_user` с `--verbose --strict` `drizzle-kit` только **покажет** SQL и спросит
подтверждение — отвечайте **No**: изменения схемы выполняются от владельца таблиц, не от приложения.

```bash
docker run --rm -it --network traefik-public -v "$PWD":/src:ro \
  -e DBPASS="$DBPASS" -e COREPACK_ENABLE_DOWNLOAD_PROMPT=0 node:24-slim bash -c '
  cp -r /src /repo && cd /repo/lib/db && corepack enable &&
  pnpm install --frozen-lockfile --filter @workspace/db... >/dev/null &&
  DATABASE_URL="postgresql://fintrack_user:$DBPASS@172.28.0.1:5432/fintrack_db" \
    pnpm exec drizzle-kit push --config ./drizzle.config.ts --verbose --strict
'
```

- «No changes detected» — схема совпадает, можно запускать. (17.10.2026: совпала, 19 таблиц.)
- Список SQL — выполнить его от `postgres` с владельцем `tulubyev`:
  `sudo -u postgres psql -d fintrack_db -c 'SET ROLE tulubyev; <SQL>'`, предварительно сделав бэкап.
- `drizzle-kit` при ошибке подключения выходит молча (`Exit status 1` после «Pulling schema»).
  Пароль в `DATABASE_URL` со спецсимволами (`@ : / # % ?`) нужно URL-кодировать.

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
docker compose -f docker-compose.prod.yml ps          # оба контейнера healthy
curl -s https://fin-wall.ru/api/healthz                # {"status":"ok"}
curl -sI https://fin-wall.ru/ | head -3                # 200, text/html
docker logs --tail 50 fintrack-api                     # ошибок валидации конфигурации нет
```

## 5. Обновление и откат

- Обновление: пуш в `main` → дождаться **Build images** → на VPS `cd /var/www/fintrack && git pull && bash deploy.sh`.
  (`git pull` нужен, только если менялись `docker-compose.prod.yml`, `deploy.sh` или `.env.example`.)
- Откат: `IMAGE_TAG=sha-<полный sha> bash deploy.sh` (теги образов — `latest` и `sha-<полный sha>`).
- Изменение схемы БД: бэкап → дифф по п. 2 → только потом деплой кода, которому эта схема нужна.

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
- Платёжные провайдеры (ЮKassa, CloudPayments) и банки (Сбер, Тинькофф) работают только при заданных ключах в `.env`.
