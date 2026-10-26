#!/usr/bin/env bash
# Проверка маршрутов режима «сайт» (E1.8-T2): кто что отдаёт на основном и app-домене, редиректы старых ссылок.
# Запуск против web-контейнера напрямую:  bash deploy/test-site-routing.sh http://127.0.0.1:8080
# Против прода после включения:          bash deploy/test-site-routing.sh https://fin-wall.ru  (хосты — из SITE/APP)
set -uo pipefail
BASE=${1:-http://127.0.0.1:8080}
SITE=${SITE:-fin-wall.ru}
APP=${APP:-app.fin-wall.ru}
fail=0

# check <хост> <путь> <ожидаемый код> [ожидаемый Location или подстрока тела]
check() {
  local host=$1 path=$2 code=$3 expect=${4:-}
  local out status location body
  out=$(curl -s -o /tmp/site-routing-body -D - -H "Host: $host" "$BASE$path")
  status=$(printf '%s' "$out" | head -1 | awk '{print $2}')
  location=$(printf '%s' "$out" | grep -i '^location:' | tr -d '\r' | cut -d' ' -f2-)
  body=$(cat /tmp/site-routing-body)
  if [ "$status" != "$code" ]; then
    echo "FAIL $host$path: код $status, ждали $code"; fail=1; return
  fi
  if [ -n "$expect" ]; then
    if [[ "$code" == 30* ]]; then
      [ "$location" = "$expect" ] || { echo "FAIL $host$path: Location «$location», ждали «$expect»"; fail=1; return; }
    else
      [[ "$body" == *"$expect"* ]] || { echo "FAIL $host$path: в ответе нет «$expect»"; fail=1; return; }
    fi
  fi
  echo "ok   $host$path → $status ${location:-}"
}

# сайт
check "$SITE" / 200 "Все ваши счета и траты"
check "$SITE" /robots.txt 200 "Sitemap: https://fin-wall.ru/sitemap-index.xml"
check "$SITE" /sitemap-index.xml 200 "sitemap"
check "$SITE" /security 200 "Безопасность и данные"
check "$SITE" /banks 200 "Банки и выписки"
check "$SITE" /banks/tbank 200 "Как скачать выписку Т-Банка"
check "$SITE" /mobile 200 "Приложение для Android и iPhone"
check "$SITE" /help 200 "Частые вопросы"
check "$SITE" /nope 404 "Такой страницы нет"
# старые ссылки приложения
check "$SITE" "/transactions?uncategorized=1" 301 "https://$APP/transactions?uncategorized=1"
check "$SITE" /accounts/42 301 "https://$APP/accounts/42"
check "$SITE" /import/abc 301 "https://$APP/import/abc"
check "$SITE" "/budgets?month=2026-10" 301 "https://$APP/budgets?month=2026-10"
check "$SITE" /login 301 "https://$APP/login"
check "$SITE" /admin/users 301 "https://$APP/admin/users"
check "$SITE" /app 301 "https://$APP/"
check "$SITE" "/app/budgets/1?x=1" 301 "https://$APP/budgets/1?x=1"
# не путь приложения — не редиректим
check "$SITE" /transactionsx 404
check "$SITE" /mobile-app 404
# приложение
check "$APP" / 200 '<div id="root">'
check "$APP" /transactions 200 '<div id="root">'
check "$APP" /robots.txt 200 "Disallow: /"

[ $fail -eq 0 ] && echo "Все маршруты в порядке" || { echo "Есть ошибки"; exit 1; }
