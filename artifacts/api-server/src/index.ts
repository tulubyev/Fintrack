import { createServer } from "http";
import { writeFile } from "fs/promises";
import { createApp } from "./app";
import { config, validateConfig } from "../config/environment";
import { logger } from "./services/logger";
import { pool } from "./db";
import { startJobs, stopJobs, workerMode } from "./jobs";

// Файл, по которому healthcheck контейнера fintrack-worker понимает, что воркер жив и видит базу
const WORKER_HEARTBEAT_FILE = "/tmp/fintrack-worker.alive";

async function startWorkerHeartbeat() {
  const beat = async () => {
    try {
      await pool.query("SELECT 1");
      await writeFile(WORKER_HEARTBEAT_FILE, new Date().toISOString());
    } catch (error) {
      logger.error("Воркер не видит базу:", error);
    }
  };
  await beat();
  setInterval(beat, 30_000).unref();
}

(async () => {
  // Валидация конфигурации при запуске
  try {
    validateConfig();
  } catch (error) {
    logger.error('🚨 Ошибка валидации конфигурации:', error);
    process.exit(1);
  }

  const mode = workerMode();

  if (mode === "off") {
    // API только ставит задачи: если очередь недоступна, сайт продолжает работать, а enqueue вернёт ошибку
    await startJobs(mode).catch((error) => logger.error("Очередь фоновых задач не запустилась:", error));
  } else {
    // Воркер без очереди бесполезен: падаем, Docker перезапустит контейнер
    await startJobs(mode);
    await startWorkerHeartbeat();
  }

  // Docker останавливает контейнер сигналом SIGTERM: даём текущим задачам закончиться
  process.once("SIGTERM", () => {
    logger.info("SIGTERM: останавливаем фоновые задачи");
    stopJobs().finally(() => process.exit(0));
  });

  if (mode === "only") return;

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
