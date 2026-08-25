#!/bin/bash

# 🛡️ FinTrack Quick Backup Script
# Быстрое создание резервной копии системы

echo "🚀 Запуск FinTrack Backup System..."
echo "==============================================="

# Проверяем наличие tsx
if ! command -v tsx &> /dev/null; then
    echo "❌ tsx не найден. Установите: npm install -g tsx"
    exit 1
fi

# Создаем backup
echo "🔄 Создание backup..."
tsx scripts/backup.ts

# Проверяем результат
if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Backup FinTrack создан успешно!"
    echo "📁 Файлы сохранены в папке: ./backups/"
    echo ""
    echo "🔧 Быстрые команды:"
    echo "   Просмотр backup:     ls -la backups/"
    echo "   Проверить архив:     tar -tzf backups/*.tar.gz | head"
    echo "   Восстановление:      tsx scripts/restore.ts <архив>"
    echo ""
else
    echo "❌ Ошибка при создании backup"
    exit 1
fi