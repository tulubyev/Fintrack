/**
 * Детекция регулярных платежей для пользователя (E1.6-T2): операции за 400 дней → detectSeries → серии в БД.
 * Повторный запуск не плодит серии: ключ (user, direction, group_key, currency); ignored и cancelled не воскрешаются,
 * а у подтверждённых серий не трогаются название, вид и категория, которые мог поправить пользователь.
 */
import { and, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { categories, recurringSeries, subscriptionServices, transactions, type RecurringSeries } from "@shared/schema";
import { db } from "../../db";
import { fromKopecks } from "../../lib/money";
import { track } from "../analytics";
import { addDays, detectSeries, type Candidate, type DetectedSeries, type ServiceRef } from "./detector";

const HISTORY_DAYS = 400;

export const todayMsk = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow" }).format(new Date());

export async function loadServices(): Promise<ServiceRef[]> {
  const rows = await db.select().from(subscriptionServices);
  return rows.map((row) => ({ id: row.id, code: row.code, name: row.name, serviceGroup: row.serviceGroup, patterns: row.patterns, trialDays: row.trialDays }));
}

async function loadCandidates(userId: string, today: string): Promise<Candidate[]> {
  const parent = sql`(SELECT p.code FROM ${categories} p WHERE p.id = ${categories.parentId})`;
  const rows = await db.select({
    id: transactions.id,
    accountId: transactions.accountId,
    type: transactions.type,
    amount: transactions.amount,
    currency: transactions.currency,
    date: transactions.localDate,
    description: transactions.description,
    merchant: transactions.merchant,
    merchantNormalized: transactions.merchantNormalized,
    categoryId: transactions.categoryId,
    // у своей категории кода нет — берём код системного родителя
    categoryCode: sql<string | null>`coalesce(${categories.code}, ${parent})`,
  }).from(transactions)
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(and(
      eq(transactions.userId, userId),
      isNull(transactions.deletedAt),
      eq(transactions.status, "posted"),
      inArray(transactions.type, ["expense", "income"]),
      isNull(transactions.transferGroupId),
      gte(transactions.localDate, addDays(today, -HISTORY_DAYS)),
    ));
  return rows.map((row) => ({ ...row, type: row.type as Candidate["type"], currency: row.currency ?? "RUB" }));
}

const money = (value: bigint | null) => (value === null ? null : fromKopecks(value));

function statsOf(series: DetectedSeries) {
  return {
    serviceId: series.serviceId,
    accountId: series.accountId,
    periodicity: series.periodicity,
    intervalDays: series.intervalDays,
    amountLast: fromKopecks(series.amountLast),
    amountMedian: fromKopecks(series.amountMedian),
    amountMin: fromKopecks(series.amountMin),
    amountMax: fromKopecks(series.amountMax),
    amountPrevious: money(series.amountPrevious),
    priceChangedAt: series.priceChangedAt,
    occurrences: series.occurrences,
    firstDate: series.firstDate,
    lastDate: series.lastDate,
    nextExpectedDate: series.nextExpectedDate,
    expectedAmount: money(series.expectedAmount),
    confidence: series.confidence,
  };
}

/** Новый статус по детекции: прекратилась — ended; возобновилась после ended — снова на подтверждение. */
function nextStatus(existing: RecurringSeries, detected: DetectedSeries): RecurringSeries["status"] {
  if (detected.ended) return existing.status === "detected" || existing.status === "confirmed" ? "ended" : existing.status;
  return existing.status === "ended" ? "detected" : existing.status;
}

const yearlyBucket = (kopecks: bigint) => {
  const rubles = Number(kopecks / 100n);
  return rubles < 5_000 ? "<5k" : rubles < 20_000 ? "5k-20k" : rubles < 50_000 ? "20k-50k" : "50k+";
};
const PER_YEAR: Record<DetectedSeries["periodicity"], bigint> = { weekly: 52n, biweekly: 26n, monthly: 12n, quarterly: 4n, yearly: 1n };

export interface DetectionResult {
  created: number;
  updated: number;
  total: number;
}

export async function detectForUser(userId: string, today = todayMsk()): Promise<DetectionResult> {
  const [candidates, services] = await Promise.all([loadCandidates(userId, today), loadServices()]);
  const detected = detectSeries(candidates, services, today);

  const result = await db.transaction(async (tx) => {
    // один детектор на пользователя за раз: ночная задача и ручной запуск не пересекаются
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`recurring:${userId}`}))`);
    const existing = await tx.select().from(recurringSeries).where(eq(recurringSeries.userId, userId));
    const byKey = new Map(existing.map((row) => [`${row.direction}|${row.currency}|${row.groupKey}`, row]));
    let created = 0;
    let updated = 0;
    const priceChanges: DetectedSeries[] = [];
    const fresh: DetectedSeries[] = [];

    for (const series of detected) {
      const current = byKey.get(`${series.direction}|${series.currency}|${series.groupKey}`);
      let id: string;
      if (!current) {
        const [row] = await tx.insert(recurringSeries).values({
          userId,
          groupKey: series.groupKey,
          displayName: series.displayName,
          direction: series.direction,
          kind: series.kind,
          categoryId: series.categoryId,
          currency: series.currency,
          status: series.ended ? "ended" : "detected",
          ...statsOf(series),
        }).returning({ id: recurringSeries.id });
        id = row.id;
        created++;
        fresh.push(series);
      } else {
        // «это не подписка» и удалённые серии не возвращаются; у отменённой обновляем факты — пригодится для «списалась после отмены»
        if (current.status === "ignored" || current.deletedAt) continue;
        const userOwned = current.status === "confirmed" || current.source === "manual";
        await tx.update(recurringSeries).set({
          ...statsOf(series),
          ...(userOwned ? {} : { displayName: series.displayName, kind: series.kind, categoryId: series.categoryId }),
          status: nextStatus(current, series),
          updatedAt: new Date(),
        }).where(eq(recurringSeries.id, current.id));
        id = current.id;
        updated++;
        if (series.priceChangedAt && series.priceChangedAt !== current.priceChangedAt) priceChanges.push(series);
      }
      await tx.update(transactions).set({ recurringSeriesId: id })
        .where(and(eq(transactions.userId, userId), inArray(transactions.id, series.transactionIds)));
    }
    return { created, updated, priceChanges, fresh };
  });

  if (result.fresh.length) {
    const kinds: Record<string, number> = {};
    let yearly = 0n;
    for (const series of result.fresh) {
      kinds[series.kind] = (kinds[series.kind] ?? 0) + 1;
      if (series.direction === "out" && series.kind === "subscription" && series.expectedAmount) yearly += series.expectedAmount * PER_YEAR[series.periodicity];
    }
    void track("recurring_detected", { userId, props: { new_series: result.fresh.length, kinds, yearly_sum_bucket: yearlyBucket(yearly) } });
  }
  for (const series of result.priceChanges) {
    const pct = series.amountPrevious ? Math.round((Number(series.amountLast - series.amountPrevious) / Number(series.amountPrevious)) * 100) : 0;
    void track("recurring_price_changed", { userId, props: { direction: pct >= 0 ? "up" : "down", pct_bucket: Math.abs(pct) < 20 ? "<20" : Math.abs(pct) < 50 ? "20-50" : "50+" } });
  }
  return { created: result.created, updated: result.updated, total: detected.length };
}

/** Пользователи с изменёнными операциями за последние сутки с запасом — для ночного запуска. */
export async function usersWithRecentChanges(hours = 26): Promise<string[]> {
  const rows = await db.selectDistinct({ userId: transactions.userId }).from(transactions)
    .where(sql`${transactions.updatedAt} > now() - make_interval(hours => ${hours})`);
  return rows.map((row) => row.userId);
}
