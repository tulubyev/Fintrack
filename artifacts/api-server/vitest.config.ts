import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));
const tmp = path.join(os.tmpdir(), "fintrack-api-tests");

// Тесты пишут в базу: берём только TEST_DATABASE_URL, чтобы случайно не попасть в рабочую по DATABASE_URL
export default defineConfig({
  resolve: { alias: { "@shared": path.join(root, "src/shared") } },
  test: {
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/globalSetup.ts"],
    fileParallelism: false, // одна база на все файлы
    testTimeout: 20_000,
    hookTimeout: 30_000,
    env: {
      NODE_ENV: "test",
      LOG_LEVEL: "warn",
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "",
      JWT_SECRET: "test-jwt-secret-not-for-production-0000000000",
      JWT_REFRESH_SECRET: "test-refresh-secret-not-for-production-000000",
      ENCRYPTION_KEY: "test-encryption-key-not-for-production-0000000000000000",
      // SMS и письма в тестах не отправляются, но сервисы требуют настройки при импорте
      SMS_RU_API_KEY: "test-sms-key-not-used",
      BEGET_SMTP_HOST: "smtp.invalid",
      BEGET_SMTP_USER: "test@example.test",
      BEGET_SMTP_PASSWORD: "test-not-used",
      DOCUMENTS_DIR: path.join(tmp, "documents"),
      UPLOADS_DIR: path.join(tmp, "uploads"),
      IMPORTS_DIR: path.join(tmp, "imports"),
      // Все запросы идут с одного адреса: лимиты поднимаем, чтобы тесты проверяли права, а не лимитер
      RATE_LIMIT_GENERAL_MAX: "100000",
      RATE_LIMIT_AUTH_MAX: "100000",
      RATE_LIMIT_MODERATE_MAX: "100000",
      RATE_LIMIT_STRICT_MAX: "100000",
      RATE_LIMIT_UPLOAD_MAX: "100000",
      RATE_LIMIT_EVENTS_MAX: "100000",
    },
  },
});
