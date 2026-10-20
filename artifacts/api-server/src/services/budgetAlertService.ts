/**
 * Предупреждения о порогах бюджета (E1.4-T3). После записи операций или бюджетов API ставит задачу `budgets.check`
 * (не больше одной в очереди на пользователя), воркер считает исполнение текущего месяца и на каждый новый пройденный
 * порог пишет `budget_alerts`. Уведомление — одно на самый высокий из новых порогов: покупка, пробившая сразу 80% и 100%,
 * даёт одно «превышен», а не два. Прошлые месяцы не проверяются: импорт старой выписки не будит пользователя.
 */
import { and, eq, inArray } from "drizzle-orm";
import { budgetAlerts } from "@shared/schema";
import { db } from "../db";
import { formatRub, toKopecks } from "../lib/money";
import { enqueue, jobsBoss } from "../jobs";
import { logger } from "./logger";
import { track } from "./analytics";
import { emailNotification } from "./notificationEmailService";
import { notify } from "./notificationService";
import { currentMonth, listBudgets, todayMsk, type BudgetStatus } from "./budgetService";

export const BUDGET_CHECK_JOB = "budgets.check";
// Операции часто пишутся пачкой (массовая правка, импорт): ждём несколько секунд и проверяем один раз
const CHECK_DELAY_SECONDS = 5;

/** Ставит проверку бюджетов пользователя. Ошибку очереди не пробрасывает: запись операции важнее предупреждения. */
export async function scheduleBudgetCheck(userId: string): Promise<void> {
  if (!jobsBoss()) return; // тесты и запуск без очереди
  try {
    await enqueue(BUDGET_CHECK_JOB, { userId }, { singletonKey: userId, startAfter: CHECK_DELAY_SECONDS });
  } catch (error) {
    logger.warn(`Не удалось поставить ${BUDGET_CHECK_JOB}:`, error);
  }
}

function message(budget: BudgetStatus, threshold: number) {
  const name = budget.category?.name ?? "Общий бюджет";
  const label = budget.categoryId ? `Бюджет «${name}»` : name;
  const limit = toKopecks(budget.effectiveAmount);
  const spent = toKopecks(budget.spent);
  const spentLine = `Потрачено ${formatRub(spent)} из ${formatRub(limit)}`;
  if (threshold < 100) {
    return { title: `${label}: ${budget.percent}%`, body: `${spentLine}, осталось ${formatRub(limit - spent)} до конца месяца` };
  }
  return spent > limit
    ? { title: `${label} превышен`, body: `${spentLine}, перерасход ${formatRub(spent - limit)}` }
    : { title: `${label} исчерпан`, body: `${spentLine}` };
}

/** Проверяет бюджеты текущего месяца; возвращает число созданных уведомлений. Повторный запуск ничего не дублирует. */
export async function checkBudgetAlerts(userId: string): Promise<number> {
  const month = currentMonth();
  const periodStart = `${month}-01`;
  const { items } = await listBudgets(userId, month);
  const all = items.flatMap((item) => [item, ...(item.children ?? [])]);
  const crossed = all.filter((budget) => budget.alertThresholds.some((threshold) => budget.percent >= threshold));
  if (!crossed.length) return 0;

  const fired = await db.select({ budgetId: budgetAlerts.budgetId, threshold: budgetAlerts.threshold }).from(budgetAlerts)
    .where(and(eq(budgetAlerts.periodStart, periodStart), inArray(budgetAlerts.budgetId, crossed.map((budget) => budget.id))));
  const firedKeys = new Set(fired.map((row) => `${row.budgetId}:${row.threshold}`));

  let created = 0;
  for (const budget of crossed) {
    const fresh = budget.alertThresholds.filter((threshold) => budget.percent >= threshold && !firedKeys.has(`${budget.id}:${threshold}`));
    if (!fresh.length) continue;
    const threshold = Math.max(...fresh);

    // Сначала уведомление (dedupKey гасит повтор), потом отметка порога: сбой между ними задача переживёт при повторе
    const notification = await notify(userId, {
      type: "budget_threshold",
      ...message(budget, threshold),
      deepLink: `/budgets?month=${month}`,
      dedupKey: `budget:${budget.id}:${month}:${threshold}`,
      payload: { budgetId: budget.id, month, threshold, percent: budget.percent },
    });
    await db.insert(budgetAlerts).values(fresh.map((value) => ({ budgetId: budget.id, periodStart, threshold: value }))).onConflictDoNothing();
    if (!notification) continue;
    created++;
    if (threshold >= 100) await emailNotification(notification); // письмо — только о перерасходе (D19)
    void track("budget_threshold_reached", {
      userId,
      props: { threshold, is_total: budget.categoryId === null, day_of_month: Number(todayMsk().slice(8, 10)) },
    });
  }
  return created;
}
