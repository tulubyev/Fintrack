#!/bin/sh
# Файлы привязки домена к приложению (E2.1-T6) — собираются при старте web-контейнера из переменных окружения:
#   ANDROID_CERT_SHA256 — SHA-256 отпечатки ключей подписи APK через запятую (AA:BB:…, 32 байта) → assetlinks.json
#   APPLE_APP_ID        — TEAMID.ru.finwall.app → apple-app-site-association
# Пусто — файл не раздаётся (404), ссылки fin-wall.ru/app/… открывают сайт. Отладочный ключ сюда не ставить:
# им может подписаться любое приложение и перехватывать ссылки.
set -eu

dir=/tmp/app-links
mkdir -p "$dir"
rm -f "$dir/assetlinks.json" "$dir/apple-app-site-association"

if [ -n "${ANDROID_CERT_SHA256:-}" ]; then
  fingerprints=""
  for fp in $(echo "$ANDROID_CERT_SHA256" | tr ',' ' '); do
    fp=$(echo "$fp" | tr 'a-f' 'A-F')
    if ! echo "$fp" | grep -Eq '^([0-9A-F]{2}:){31}[0-9A-F]{2}$'; then
      echo "40-app-links: неверный отпечаток в ANDROID_CERT_SHA256 — assetlinks.json не создан" >&2
      fingerprints=""
      break
    fi
    fingerprints="${fingerprints:+$fingerprints,}\"$fp\""
  done
  if [ -n "$fingerprints" ]; then
    printf '[{"relation":["delegate_permission/common.handle_all_urls"],"target":{"namespace":"android_app","package_name":"ru.finwall.app","sha256_cert_fingerprints":[%s]}}]\n' \
      "$fingerprints" > "$dir/assetlinks.json"
  fi
fi

if [ -n "${APPLE_APP_ID:-}" ]; then
  if echo "$APPLE_APP_ID" | grep -Eq '^[A-Z0-9]{10}\.ru\.finwall\.app$'; then
    printf '{"applinks":{"details":[{"appIDs":["%s"],"components":[{"/":"/app/*"}]}]}}\n' "$APPLE_APP_ID" \
      > "$dir/apple-app-site-association"
  else
    echo "40-app-links: APPLE_APP_ID должен быть вида TEAMID.ru.finwall.app — файл не создан" >&2
  fi
fi
