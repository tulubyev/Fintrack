/**
 * Напоминания о регулярных списаниях (E1.6-T5): за remind_days_before дней до ожидаемого списания — одно in-app
 * уведомление на одно списание (dedup_key = recurring:<id>:<date>). Напоминаем о подтверждённых сериях и о пробных
 * периодах (их пользователь мог ещё не подтвердить, а цена ошибки — полное списание). Годовые и пробные — ещё и письмом.
 */
import { and, between, eq, gt, inArray, isNull } from "drizzle-orm";
import { recurringSeries, type RecurringSeries } from "@shared/schema";
import { db } from "../../db";
import { formatRub, toKopecks } from "../../lib/money";
import { track } from "../analytics";
import { emailNotification } from "../notificationEmailService";
import { notify } from "../notificationService";
import { addDays, daysBetween } from "./detector";
import { todayMsk } from "./recurringService";

const MAX_REMIND_DAYS = 7;

const quoted = (name: string) => `«${name}»`;
const amountText = (amount: string, currency: string) => (currency === "RUB" ? formatRub(toKopecks(amount)) : `${amount} ${currency}`);

function whenText(days: number): string {
  if (days === 0) return "Сегодня";
  if (days === 1) return "Завтра";
  return `Через ${days} ${days < 5 ? "дня" : "дней"}`;
}

/** «Через 2 дня спишется «Яндекс Плюс» — 299 ₽»; у пробного периода — о его конце. */
export function reminderMessage(series: Pick<RecurringSeries, "displayName" | "kind" | "expectedAmount" | "currency">, days: number) {
  const amount = series.expectedAmount ? amountText(series.expectedAmount, series.currency) : null;
  if (series.kind === "trial") {
    return {
      title: `${whenText(days)} закончится пробный период ${quoted(series.displayName)}`,
      body: amount
        ? `Дальше спишется ${amount}. Если подписка не нужна — отмените её заранее.`
        : "Дальше начнутся платные списания. Если подписка не нужна — отмените её заранее.",
    };
  }
  return {
    title: `${whenText(days)} спишется ${quoted(series.displayName)}${amount ? ` — ${amount}` : ""}`,
    body: "Проверьте, что на карте хватает денег, или отмените подписку, если она больше не нужна.",
  };
}

/** Напоминания на сегодня по всем пользователям. Повторный запуск в тот же день ничего не дублирует. */
export async function sendReminders(today = todayMsk()): Promise<number> {
  const rows = await db.select().from(recurringSeries).where(and(
    isNull(recurringSeries.deletedAt),
    eq(recurringSeries.direction, "out"),
    inArray(recurringSeries.status, ["detected", "confirmed"]),
    gt(recurringSeries.remindDaysBefore, 0),
    between(recurringSeries.nextExpectedDate, today, addDays(today, MAX_REMIND_DAYS)),
  ));

  let sent = 0;
  for (const series of rows) {
    if (series.status !== "confirmed" && series.kind !== "trial") continue;
    const date = series.nextExpectedDate!;
    const days = daysBetween(today, date);
    if (days > series.remindDaysBefore) continue;
    const notification = await notify(series.userId, {
      type: "recurring_upcoming",
      ...reminderMessage(series, days),
      deepLink: `/subscriptions?open=${series.id}`,
      dedupKey: `recurring:${series.id}:${date}`,
      payload: { seriesId: series.id, date, amount: series.expectedAmount },
    });
    if (!notification) continue;
    sent++;
    // письмом — годовые подписки и конец пробного периода: о них легче всего забыть (D19)
    if (series.kind === "trial" || series.periodicity === "yearly") await emailNotification(notification);
    void track("recurring_reminder_sent", { userId: series.userId, props: { periodicity: series.periodicity, channel: "in_app", kind: series.kind } });
  }
  return sent;
}
