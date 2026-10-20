import type { Queue } from "pg-boss";
import { sessionService } from "../services/sessionService";
import { logger } from "../services/logger";
import { purgeOldEvents } from "../services/analytics";
import { backfillRates, countRateDates, syncDailyRates } from "../services/fxService";
import { cleanupNotifications as purgeReadNotifications } from "../services/notificationService";

export interface JobDefinition<T extends object = object> {
  /** Имя очереди: `<область>.<действие>`, например `import.parse` */
  name: string;
  handler: (data: T) => Promise<void>;
  /** Перекрывает настройки очереди по умолчанию (jobs/index.ts); policy задаётся только при создании очереди */
  options?: Omit<Queue, "name">;
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

// Предупреждения о порогах бюджета (E1.4-T3): ставится после записи операций и бюджетов (scheduleBudgetCheck).
// stately + singletonKey: на пользователя не больше одной проверки в очереди и одной в работе — запись во время
// проверки не теряется, а пачка записей даёт одну проверку
const budgetsCheck: JobDefinition<{ userId?: string }> = {
  name: "budgets.check",
  options: { policy: "stately" },
  handler: async ({ userId }) => {
    if (!userId) return;
    // сервис сам ставит эту задачу через jobs/index — импорт в момент выполнения разрывает цикл модулей
    const { checkBudgetAlerts } = await import("../services/budgetAlertService");
    await checkBudgetAlerts(userId);
  },
};

// Регулярные платежи (E1.6-T2): с userId — для одного пользователя (после импорта, ручной запуск),
// без него — ночью для всех, у кого за сутки менялись операции. Повторный запуск безопасен: серии ищутся по ключу
const recurringDetect: JobDefinition<{ userId?: string }> = {
  name: "recurring.detect",
  cron: "0 3 * * *",
  options: { policy: "stately", expireInSeconds: 60 * 60 },
  handler: async ({ userId }) => {
    const { detectForUser, usersWithRecentChanges } = await import("../services/recurring/recurringService");
    if (userId) {
      await detectForUser(userId);
      return;
    }
    const users = await usersWithRecentChanges();
    for (const id of users) await detectForUser(id);
    logger.info(`recurring.detect: проверено пользователей ${users.length}`);
  },
};

// Напоминания о списаниях (E1.6-T5): днём, после ночного поиска серий. Повтор в тот же день гасит dedup_key
const recurringRemind: JobDefinition = {
  name: "recurring.remind",
  cron: "0 10 * * *",
  handler: async () => {
    const { sendReminders } = await import("../services/recurring/reminderService");
    const sent = await sendReminders();
    logger.info(`recurring.remind: отправлено напоминаний ${sent}`);
  },
};

// Письма о важных уведомлениях (D19): повтор после сбоя SMTP не шлёт второе письмо — см. notifications.emailed_at
const notificationsEmail: JobDefinition<{ notificationId: string }> = {
  name: "notifications.email",
  options: { retryLimit: 3, retryDelay: 300, retryBackoff: true },
  handler: async ({ notificationId }) => {
    const { deliverNotificationEmail } = await import("../services/notificationEmailService");
    await deliverNotificationEmail(notificationId);
  },
};

// Категоризация нейросетью (E1.3-T8): повтор безопасен — берутся только операции, всё ещё без категории, ответы из кеша
const categorizeLlm: JobDefinition<{ userId: string; transactionIds?: string[] }> = {
  name: "categorize.llm",
  options: { retryLimit: 2, retryDelay: 120, retryBackoff: true },
  handler: async ({ userId, transactionIds }) => {
    const { runLlmCategorization } = await import("../services/categorization/llm");
    await runLlmCategorization(userId, transactionIds);
  },
};

// Все задачи приложения. Новая задача — сюда, обработчик — рядом в jobs/
export const jobDefinitions: JobDefinition<any>[] = [cleanupSessions, cleanupEvents, cleanupNotifications, fxRatesDaily, fxRatesBackfill, budgetsCheck, recurringDetect, recurringRemind, notificationsEmail, categorizeLlm];
