#!/usr/bin/env bash
# Деплой FinTrack на VPS: pull образов из GHCR, up -d, ожидание healthy.
# Запуск:  cd /var/www/fintrack && bash deploy.sh
# Откат:   IMAGE_TAG=sha-<полный sha> bash deploy.sh
set -euo pipefail
cd "$(dirname "$0")"

COMPOSE=(docker compose -f docker-compose.prod.yml)

[ -f .env ] || { echo "Нет .env — скопируйте .env.example и заполните" >&2; exit 1; }

"${COMPOSE[@]}" pull
"${COMPOSE[@]}" up -d --remove-orphans

for name in fintrack-api fintrack-web; do
  echo -n "Ожидание $name healthy "
  for _ in $(seq 1 40); do
    status=$(docker inspect --format '{{.State.Health.Status}}' "$name" 2>/dev/null || echo none)
    if [ "$status" = "healthy" ]; then echo "ok"; continue 2; fi
    echo -n "."; sleep 3
  done
  echo
  echo "$name не стал healthy за 120 с. Логи: docker logs $name" >&2
  exit 1
done

docker image prune -f >/dev/null
"${COMPOSE[@]}" ps
