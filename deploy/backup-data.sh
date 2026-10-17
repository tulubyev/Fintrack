#!/usr/bin/env bash
# Бэкап тома fintrack_data (зашифрованные документы + фото профилей).
# База копируется отдельно (vps-server-infra/scripts/pg-backup.sh), том — нет.
# Cron (root):  30 3 * * * /var/www/fintrack/deploy/backup-data.sh
# Документы зашифрованы ENCRYPTION_KEY из .env — храните ключ и вне VPS.
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/fintrack}"
KEEP_DAYS="${KEEP_DAYS:-14}"
STAMP=$(date +%Y%m%d-%H%M%S)

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

docker run --rm \
  -v fintrack_data:/data:ro \
  -v "$BACKUP_DIR":/backup \
  alpine:3.20 tar czf "/backup/fintrack-data-$STAMP.tar.gz" -C /data .

find "$BACKUP_DIR" -name 'fintrack-data-*.tar.gz' -mtime +"$KEEP_DAYS" -delete
echo "OK: $BACKUP_DIR/fintrack-data-$STAMP.tar.gz"
