# Развёртывание FinTrack на VPS

Документ по `vps-server-infra/docs/NEW-PROJECT.md`, Вариант A (полный Docker).

| Параметр | Значение |
|---|---|
| Домен | `fin-wall.ru` (DNS A → 90.156.168.149) |
| Путь на VPS | `/var/www/fintrack/` (git clone этого репозитория) |
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
ролью, а владельцем схемы остаётся `tulubyev` — миграции выполняются под ним
(как у `lms_app_user` в Mentingo).

```bash
sudo -u postgres psql -d fintrack_db <<'SQL'
CREATE ROLE fintrack_user LOGIN PASSWORD 'СГЕНЕРИРУЙТЕ_ПАРОЛЬ';
GRANT CONNECT ON DATABASE fintrack_db TO fintrack_user;
GRANT USAGE ON SCHEMA public TO fintrack_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO fintrack_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO fintrack_user;
-- таблицы, которые появятся позже под tulubyev:
ALTER DEFAULT PRIVILEGES FOR ROLE tulubyev IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO fintrack_user;
ALTER DEFAULT PRIVILEGES FOR ROLE tulubyev IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO fintrack_user;
SQL
```

Доступ из контейнера: правило `host all all 172.28.0.0/16 md5` в `pg_hba.conf` уже есть
(сеть `traefik-public`). Проверка с VPS: `psql "postgresql://fintrack_user:…@172.28.0.1:5432/fintrack_db" -c '\dt'`.

## 2. Сверка схемы со старой базой

Источник правды по схеме — `lib/db/src/schema/index.ts`. Старая база создана Replit-версией
приложения, поэтому перед запуском проверяем расхождения.

1. **Бэкап** (даже если ночной уже есть):
   ```bash
   pg_dump -U tulubyev -Fc fintrack_db > ~/fintrack_db_$(date +%F).dump
   ```
2. **Дифф схемы** через SSH-туннель, с рабочей машины (не `push-force`!):
   ```bash
   ssh -N -L 15432:127.0.0.1:5432 tulubyev@90.156.168.149 &
   DATABASE_URL=postgresql://tulubyev:…@127.0.0.1:15432/fintrack_db \
     pnpm --filter @workspace/db run push
   ```
   `drizzle-kit push` покажет изменения и спросит подтверждение на всё, что теряет данные
   (удаление колонок/таблиц) — на такие вопросы отвечайте **нет** и разбирайтесь отдельно.
   Если туннель не пускает (`pg_hba` для 127.0.0.1), выполните то же на VPS из клона репозитория.
3. **Старые файлы.** Файлы из Replit в новый том не попали. Если в таблице `documents` есть записи,
   их зашифрованные файлы (`saveddata/*.enc`) нужно скопировать в том (`/data/documents`), причём
   `ENCRYPTION_KEY` должен остаться прежним — иначе документы не расшифровать.
   Ссылки на фото вида `/uploads/…` теперь не работают (новые фото — `/api/profile/images/…`):
   `UPDATE users SET profile_image_url = NULL WHERE profile_image_url LIKE '/uploads/%';`

## 3. Секреты и запуск

```bash
sudo mkdir -p /var/www/fintrack && sudo chown tulubyev: /var/www/fintrack
cd /var/www/fintrack
git clone https://github.com/tulubyev/fintrack.git .
cp .env.example .env && chmod 600 .env
nano .env          # DATABASE_URL, JWT_*, ENCRYPTION_KEY, SMS_RU_API_KEY, BEGET_SMTP_PASSWORD …
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
- Refresh-токен при логине отдаётся заглушкой (`routes/auth.ts`, TODO) — сессия живёт 15 минут access-токена.
- Платёжные провайдеры (ЮKassa, CloudPayments) и банки (Сбер, Тинькофф) работают только при заданных ключах в `.env`.
