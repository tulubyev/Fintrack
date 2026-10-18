import type { QueueOptions } from "pg-boss";
import { sessionService } from "../services/sessionService";
import { logger } from "../services/logger";
import { purgeOldEvents } from "../services/analytics";

export interface JobDefinition<T extends object = object> {
  /** Имя очереди: `<область>.<действие>`, например `import.parse` */
  name: string;
  handler: (data: T) => Promise<void>;
  /** Перекрывает настройки очереди по умолчанию (jobs/index.ts) */
  options?: QueueOptions;
  /** Расписание в формате cron по московскому времени: задачу ставит сам воркер */
  cron?: string;
}

// Истёкшие и отозванные сессии не нужны ни для входа, ни для списка устройств
const cleanupSessions: JobDefinition = {
  name: "cleanup.sessions",
  cron: "0 4 * * *",
  handler: async () => {
    const deleted = await sessionService.purgeStale(30);
    logger.info(`cleanup.sessions: удалено ${deleted} старых сессий`);
  },
};

// Продуктовые события храним 400 дней: хватает на годовые когорты и сравнение с прошлым годом
const cleanupEvents: JobDefinition = {
  name: "cleanup.events",
  cron: "15 4 * * *",
  handler: async () => {
    const deleted = await purgeOldEvents(400);
    logger.info(`cleanup.events: удалено ${deleted} событий старше 400 дней`);
  },
};

// Все задачи приложения. Новая задача — сюда, обработчик — рядом в jobs/
export const jobDefinitions: JobDefinition<any>[] = [cleanupSessions, cleanupEvents];
