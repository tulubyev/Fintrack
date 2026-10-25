#!/bin/sh
# Режим «сайт» (E1.8, D21): SITE_ENABLED=true — fin-wall.ru отдаёт публичный сайт, приложение живёт на APP_HOST.
# Без переменной контейнер работает как раньше: приложение на любом хосте (deploy/nginx.conf).
set -eu

if [ "${SITE_ENABLED:-false}" != "true" ]; then
  echo "site-mode: выключен — приложение на основном домене"
  exit 0
fi

: "${APP_HOST:?SITE_ENABLED=true требует APP_HOST, например app.fin-wall.ru}"
case "$APP_HOST" in
  *[!a-z0-9.-]*) echo "site-mode: недопустимый APP_HOST «$APP_HOST»" >&2; exit 1 ;;
esac

envsubst '${APP_HOST}' < /etc/nginx/site/nginx-site.conf.template > /etc/nginx/conf.d/default.conf
echo "site-mode: включён — сайт на основном домене, приложение на $APP_HOST"
