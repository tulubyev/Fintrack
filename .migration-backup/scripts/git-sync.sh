#!/bin/bash

# Скрипт для синхронизации с GitHub
# Использование: bash scripts/git-sync.sh "описание изменений"

# Проверяем есть ли изменения
if [ -z "$(git status --porcelain)" ]; then
    echo "Нет изменений для commit'а"
    exit 0
fi

# Получаем сообщение commit'а или используем дефолтное
COMMIT_MESSAGE="${1:-"Автоматическое обновление $(date '+%Y-%m-%d %H:%M:%S')"}"

# Добавляем все изменения
git add .

# Делаем commit
git commit -m "$COMMIT_MESSAGE"

# Отправляем на GitHub
git push origin main

echo "✅ Изменения успешно отправлены на GitHub"
echo "📝 Сообщение: $COMMIT_MESSAGE"