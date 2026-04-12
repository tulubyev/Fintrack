#!/bin/bash
# FinTrack Secrets Export Script
# ВНИМАНИЕ: Запускайте только локально, не коммитьте результат!

echo "# FinTrack Environment Variables Export"
echo "# Создано: $(date)"
echo "# ВНИМАНИЕ: Не коммитьте этот файл с реальными значениями!"
echo ""

echo "# ===== ОБЯЗАТЕЛЬНЫЕ ПЕРЕМЕННЫЕ ====="
echo "DATABASE_URL=$DATABASE_URL"
echo "JWT_SECRET=$JWT_SECRET" 
echo "ENCRYPTION_KEY=$ENCRYPTION_KEY"
echo ""

echo "# ===== API КЛЮЧИ ====="
echo "OPENROUTER_API_KEY=$OPENROUTER_API_KEY"
echo "SMS_RU_API_KEY=$SMS_RU_API_KEY"
echo ""

echo "# ===== EMAIL НАСТРОЙКИ ====="
echo "BEGET_SMTP_HOST=$BEGET_SMTP_HOST"
echo "BEGET_SMTP_PORT=$BEGET_SMTP_PORT"
echo "BEGET_SMTP_USER=$BEGET_SMTP_USER"
echo "BEGET_SMTP_PASSWORD=$BEGET_SMTP_PASSWORD"
echo ""

echo "# ===== ДОПОЛНИТЕЛЬНЫЕ ====="
echo "NODE_ENV=development"
echo "PORT=5000"
echo "LOG_LEVEL=info"