import type { QueueOptions } from "pg-boss";
import { sessionService } from "../services/sessionService";
import { logger } from "../services/logger";
import { purgeOldEvents } from "../services/analytics";
import { backfillRates, countRateDates, syncDailyRates } from "../services/fxService";
import { cleanupNotifications as purgeReadNotifications } from "../services/notificationService";

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

const cleanupNotifications: JobDefinition = {
  name: "cleanup.notifications",
  cron: "30 4 * * *",
  handler: async () => {
    const deleted = await purgeReadNotifications();
    logger.info(`cleanup.notifications: удалено ${deleted} прочитанных уведомлений старше 90 дней`);
  },
};

// Курсы ЦБ для amount_rub и общего баланса в рублях (E1.1-T2). ЦБ публикует курсы на завтра после обеда
const fxRatesDaily: JobDefinition = {
  name: "fx.rates.daily",
  cron: "0 16 * * *",
  options: { retryLimit: 5, retryDelay: 300, retryBackoff: true }, // ЦБ бывает недоступен: повторяем до вечера
  handler: async () => {
    await syncDailyRates();
    // Истории меньше двух лет — ставим начальное заполнение (singletonKey: не больше одной такой задачи)
    if (await countRateDates() < 2 * 250) {
      const { enqueue } = await import("./index");
      await enqueue("fx.rates.backfill", {}, { singletonKey: "fx-backfill" });
    }
  },
};

// Начальное заполнение за 3 года; ставится вручную (docs/DEPLOY.md) и безопасно перезапускается
const fxRatesBackfill: JobDefinition<{ days?: number }> = {
  name: "fx.rates.backfill",
  options: { retryLimit: 3, retryDelay: 600, expireInSeconds: 2 * 60 * 60 },
  handler: async ({ days }) => {
    await backfillRates(days ?? 3 * 365);
  },
};

// Все задачи приложения. Новая задача — сюда, обработчик — рядом в jobs/
export const jobDefinitions: JobDefinition<any>[] = [cleanupSessions, cleanupEvents, cleanupNotifications, fxRatesDaily, fxRatesBackfill];
