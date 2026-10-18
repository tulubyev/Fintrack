#!/usr/bin/env bash
# Миграции схемы FinTrack на VPS (docs/DEPLOY.md, «Миграции схемы»).
#
#   bash db-migrate.sh && bash deploy.sh   # выкатка с новой миграцией
#   bash db-migrate.sh status              # что применено и что ждёт
#   bash db-migrate.sh baseline            # однократно: переход с drizzle-kit push на миграции
#
# SQL печатает скрипт из нового образа API, выполняет его psql от postgres с ролью tulubyev.
# Любая ошибка останавливает скрипт: deploy.sh после неудачи не запустится.
set -euo pipefail
cd "$(dirname "$0")"

DB_NAME=${DB_NAME:-fintrack_db}
OWNER_ROLE=${MIGRATIONS_OWNER_ROLE:-tulubyev}
APP_ROLE=${MIGRATIONS_APP_ROLE:-fintrack_user}
COMPOSE=(docker compose -f docker-compose.prod.yml)

api() { "${COMPOSE[@]}" run --rm --no-deps -T api "$@"; }
psql_db() { sudo -u postgres psql -d "$1" -v ON_ERROR_STOP=1 -q; }
backup() {
  mkdir -p ~/db_backups
  local file=~/db_backups/${DB_NAME}_$(date +%F_%H%M%S).dump
  sudo -u postgres pg_dump -Fc "$DB_NAME" > "$file"
  echo "Бэкап: $file"
}
schema() {
  sudo -u postgres pg_dump -s --no-owner --no-privileges -N drizzle -N pgboss "$1" \
    | grep -v '^--\|^SET \|^SELECT pg_catalog\|^\\\(un\)\?restrict\|^$' \
    | sort_columns
}
# Порядок колонок не важен: на проде их добавляли по одной через push, а в миграции они идут по схеме.
# Внутри каждого CREATE TABLE колонки сортируются, запятые в конце строк убираются — сравниваются имя, тип и DEFAULT.
sort_columns() {
  awk '
    /^CREATE TABLE / { print; inside = 1; n = 0; next }
    inside && /^\);?$/ {
      for (i = 2; i <= n; i++) {   # сортировка вставками: без внешнего sort и перемешивания вывода
        line = cols[i]
        for (j = i - 1; j > 0 && cols[j] "" > line ""; j--) cols[j + 1] = cols[j]
        cols[j + 1] = line
      }
      for (i = 1; i <= n; i++) print cols[i]
      print; inside = 0; next
    }
    inside { sub(/,$/, ""); cols[++n] = $0; next }
    { print }
  '
}

# Очередь фоновых задач (pg-boss) создаёт свои таблицы сама, поэтому её схема принадлежит приложению.
# Остальная база для fintrack_user по-прежнему только DML. Повторный запуск ничего не меняет.
ensure_pgboss_schema() {
  psql_db "$DB_NAME" <<< "SET client_min_messages = warning; CREATE SCHEMA IF NOT EXISTS pgboss AUTHORIZATION \"$APP_ROLE\";"
}

mode=${1:-apply}
"${COMPOSE[@]}" pull api >/dev/null

case "$mode" in
  status)
    api node dist/scripts/migrations-sql.mjs status
    ;;

  baseline)
    backup
    # Схема прода должна совпасть с базовой миграцией: разворачиваем её во временной базе и сравниваем
    check_db=${DB_NAME}_baseline_check
    tmp=$(mktemp -d)
    sudo -u postgres dropdb --if-exists "$check_db"
    trap 'sudo -u postgres dropdb --if-exists "$check_db"; rm -rf "$tmp"' EXIT
    sudo -u postgres createdb "$check_db"
    api cat migrations/0000_baseline.sql | psql_db "$check_db"
    # через файлы, а не <(...): так ошибка pg_dump останавливает скрипт, а не даёт «пустые схемы совпали»
    schema "$DB_NAME" > "$tmp/prod.sql"
    schema "$check_db" > "$tmp/baseline.sql"
    if ! diff "$tmp/prod.sql" "$tmp/baseline.sql"; then
      echo "Схема $DB_NAME отличается от базовой миграции (выше). Baseline не записан — пришлите вывод." >&2
      exit 1
    fi
    echo "Схемы совпадают"
    can_create=$(sudo -u postgres psql -d "$DB_NAME" -tAc "SELECT has_database_privilege('$OWNER_ROLE', '$DB_NAME', 'CREATE')")
    if [ "$can_create" != "t" ]; then
      echo "У роли $OWNER_ROLE нет права CREATE на базу: sudo -u postgres psql -c 'GRANT CREATE ON DATABASE $DB_NAME TO $OWNER_ROLE'" >&2
      exit 1
    fi
    sql=$(api node dist/scripts/migrations-sql.mjs baseline)
    psql_db "$DB_NAME" <<< "$sql"
    api node dist/scripts/migrations-sql.mjs status
    ;;

  apply)
    ensure_pgboss_schema
    sql=$(api node dist/scripts/migrations-sql.mjs pending)
    if [ "$sql" = "-- Ожидающих миграций нет" ]; then
      echo "Ожидающих миграций нет"
      exit 0
    fi
    echo "$sql"
    backup
    psql_db "$DB_NAME" <<< "$sql"
    api node dist/scripts/migrations-sql.mjs status
    ;;

  *)
    echo "Использование: bash db-migrate.sh [apply|status|baseline]" >&2
    exit 2
    ;;
esac
