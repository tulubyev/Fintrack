import { createServer } from "http";
import { createApp } from "./app";
import { config, validateConfig } from "../config/environment";
import { logger } from "./services/logger";

(async () => {
  // Валидация конфигурации при запуске
  try {
    validateConfig();
  } catch (error) {
    logger.error('🚨 Ошибка валидации конфигурации:', error);
    process.exit(1);
  }

  const server = createServer(await createApp());

  // The client is now owned by the separate FinTrack web artifact.
  server.listen({
    port: config.port,
    host: config.host,
    reusePort: true,
  }, () => {
    logger.info(`serving on port ${config.port}`);
  });
})();
