/**
 * API регулярных платежей (E1.6-T3): список с итогами и пересечениями сервисов, ближайшие списания, карточка,
 * смена статуса, ручная серия из выбранных операций. Чужая серия неотличима от несуществующей (404).
 */
import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { categories, recurringSeries, subscriptionServices, transactions, type RecurringSeries, type SubscriptionService } from "@shared/schema";
import { db } from "../../db";
import { ApiError } from "../../lib/apiError";
import { fromKopecks, toKopecks } from "../../lib/money";
import { toTransactionDto } from "../ledgerService";
import { track } from "../analytics";
import { addDays, addMonths, daysBetween, groupKeyOf, type Periodicity } from "./detector";
import { todayMsk } from "./recurringService";

export const SERIES_KINDS = ["subscription", "utility", "loan", "rent", "salary", "pension", "trial", "other"] as const;
export const SERIES_STATUSES = ["detected", "confirmed", "ignored", "cancelled", "ended"] as const;
const ACTIVE = new Set(["detected", "confirmed"]);
const MANDATORY = new Set(["utility", "loan", "rent"]);
// группы сервисов, где две подписки сразу — повод задуматься
const OVERLAP_GROUPS: Record<string, string> = { video: "онлайн-кинотеатры", music: "музыкальные сервисы", books: "книжные сервисы", cloud: "облачные хранилища" };
// что уже входит в Яндекс Плюс
const PLUS_INCLUDES = new Set(["kinopoisk", "yandex_music", "yandex_books"]);

// в месяц и в год: weekly × 52/12 и × 52, quarterly × 1/3 и × 4, yearly × 1/12 и × 1
const PER_YEAR: Record<Periodicity, bigint> = { weekly: 52n, biweekly: 26n, monthly: 12n, quarterly: 4n, yearly: 1n };

export interface SeriesDto {
  id: string;
  displayName: string;
  kind: string;
  direction: string;
  source: string;
  service: { code: string; name: string; group: string; cancelUrl: string | null; cancelSteps: string | null; verified: boolean } | null;
  accountId: string | null;
  categoryId: string | null;
  currency: string;
  periodicity: string;
  amountLast: string;
  expectedAmount: string | null;
  monthlyEquivalent: string;
  yearlyEquivalent: string;
  nextExpectedDate: string | null;
  lastDate: string;
  firstDate: string;
  occurrences: number;
  confidence: number;
  status: string;
  remindDaysBefore: number;
  priceChange: { from: string; to: string; date: string } | null;
  overlapGroup: string | null;
  cancelledAt: Date | null;
}

const amountOf = (row: RecurringSeries) => toKopecks(row.expectedAmount ?? row.amountLast);
const yearly = (row: RecurringSeries) => amountOf(row) * PER_YEAR[row.periodicity as Periodicity];

function toDto(row: RecurringSeries, service: SubscriptionService | undefined, overlapGroup: string | null): SeriesDto {
  const perYear = yearly(row);
  return {
    id: row.id,
    displayName: row.displayName,
    kind: row.kind,
    direction: row.direction,
    source: row.source,
    service: service ? {
      code: service.code, name: service.name, group: service.serviceGroup,
      cancelUrl: service.cancelUrl, cancelSteps: service.cancelSteps, verified: Boolean(service.verifiedAt),
    } : null,
    accountId: row.accountId,
    categoryId: row.categoryId,
    currency: row.currency,
    periodicity: row.periodicity,
    amountLast: row.amountLast,
    expectedAmount: row.expectedAmount,
    monthlyEquivalent: fromKopecks(perYear / 12n),
    yearlyEquivalent: fromKopecks(perYear),
    nextExpectedDate: row.nextExpectedDate,
    lastDate: row.lastDate,
    firstDate: row.firstDate,
    occurrences: row.occurrences,
    confidence: row.confidence,
    status: row.status,
    remindDaysBefore: row.remindDaysBefore,
    priceChange: row.amountPrevious && row.priceChangedAt ? { from: row.amountPrevious, to: row.amountLast, date: row.priceChangedAt } : null,
    overlapGroup,
    cancelledAt: row.cancelledAt,
  };
}

async function servicesById(ids: (string | null)[]): Promise<Map<string, SubscriptionService>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (!unique.length) return new Map();
  const rows = await db.select().from(subscriptionServices).where(inArray(subscriptionServices.id, unique));
  return new Map(rows.map((row) => [row.id, row]));
}

/** Пересечения среди действующих подписок: два онлайн-кинотеатра; Кинопоиск отдельно при Яндекс Плюсе. */
function findOverlaps(rows: RecurringSeries[], services: Map<string, SubscriptionService>) {
  const active = rows.filter((row) => row.direction === "out" && row.kind === "subscription" && ACTIVE.has(row.status) && row.serviceId);
  const groups = new Map<string, string[]>();
  for (const row of active) {
    const group = services.get(row.serviceId!)!.serviceGroup;
    if (OVERLAP_GROUPS[group]) groups.set(group, [...(groups.get(group) ?? []), row.id]);
  }
  const result: { group: string; label: string; seriesIds: string[] }[] = [];
  for (const [group, ids] of groups) if (ids.length >= 2) result.push({ group, label: OVERLAP_GROUPS[group], seriesIds: ids });
  const plus = active.find((row) => services.get(row.serviceId!)!.code === "yandex_plus");
  const included = active.filter((row) => PLUS_INCLUDES.has(services.get(row.serviceId!)!.code));
  if (plus && included.length) result.push({ group: "yandex_plus", label: "уже входит в Яндекс Плюс", seriesIds: [plus.id, ...included.map((row) => row.id)] });
  return result;
}

export interface ListFilters {
  kind?: string[];
  status?: string[];
  direction?: "in" | "out";
}

export async function listSeries(userId: string, filters: ListFilters) {
  const all = await db.select().from(recurringSeries).where(and(eq(recurringSeries.userId, userId), isNull(recurringSeries.deletedAt)));
  const services = await servicesById(all.map((row) => row.serviceId));
  const overlaps = findOverlaps(all, services);
  const overlapOf = new Map<string, string>();
  for (const overlap of overlaps) for (const id of overlap.seriesIds) if (!overlapOf.has(id)) overlapOf.set(id, overlap.group);

  const statuses = new Set(filters.status?.length ? filters.status : ["detected", "confirmed"]);
  const items = all
    .filter((row) => statuses.has(row.status) && (!filters.kind?.length || filters.kind.includes(row.kind)) && (!filters.direction || row.direction === filters.direction))
    .sort((a, b) => (a.nextExpectedDate ?? "9999").localeCompare(b.nextExpectedDate ?? "9999") || a.displayName.localeCompare(b.displayName));

  // итоги — по действующим сериям в рублях, независимо от фильтра списка
  const active = all.filter((row) => ACTIVE.has(row.status) && row.currency === "RUB");
  const sum = (rows: RecurringSeries[]) => rows.reduce((total, row) => total + yearly(row), 0n);
  const subscriptions = active.filter((row) => row.direction === "out" && row.kind === "subscription");
  const subsYear = sum(subscriptions);
  const mandatoryYear = sum(active.filter((row) => row.direction === "out" && MANDATORY.has(row.kind)));
  const incomeYear = sum(active.filter((row) => row.direction === "in"));
  return {
    items: items.map((row) => toDto(row, row.serviceId ? services.get(row.serviceId) : undefined, overlapOf.get(row.id) ?? null)),
    totals: {
      monthly: fromKopecks(subsYear / 12n),
      yearly: fromKopecks(subsYear),
      count: subscriptions.length,
      mandatoryMonthly: fromKopecks(mandatoryYear / 12n),
      incomeMonthly: fromKopecks(incomeYear / 12n),
      newCount: all.filter((row) => row.status === "detected").length,
    },
    overlaps,
  };
}

/** Ближайшие списания и поступления за days дней: у недельных их может быть несколько. */
export async function upcoming(userId: string, days: number) {
  const today = todayMsk();
  const until = addDays(today, days);
  const rows = await db.select().from(recurringSeries).where(and(
    eq(recurringSeries.userId, userId), isNull(recurringSeries.deletedAt), inArray(recurringSeries.status, ["detected", "confirmed"]),
  ));
  const items: { seriesId: string; displayName: string; kind: string; direction: string; date: string; amount: string; currency: string; accountId: string | null }[] = [];
  for (const row of rows) {
    if (!row.nextExpectedDate || !row.expectedAmount) continue;
    let date = row.nextExpectedDate;
    for (let i = 0; date <= until && i < 60; i++) {
      if (date >= today) {
        items.push({ seriesId: row.id, displayName: row.displayName, kind: row.kind, direction: row.direction, date, amount: row.expectedAmount, currency: row.currency, accountId: row.accountId });
      }
      date = step(date, row.periodicity as Periodicity);
    }
  }
  items.sort((a, b) => a.date.localeCompare(b.date) || a.displayName.localeCompare(b.displayName));
  const total = items.filter((item) => item.direction === "out" && item.currency === "RUB").reduce((sum, item) => sum + toKopecks(item.amount), 0n);
  return { items, total: fromKopecks(total) };
}

function step(date: string, periodicity: Periodicity): string {
  switch (periodicity) {
    case "weekly": return addDays(date, 7);
    case "biweekly": return addDays(date, 14);
    case "monthly": return addMonths(date, 1);
    case "quarterly": return addMonths(date, 3);
    case "yearly": return addMonths(date, 12);
  }
}

async function getOwn(userId: string, id: string): Promise<RecurringSeries> {
  const [row] = await db.select().from(recurringSeries)
    .where(and(eq(recurringSeries.id, id), eq(recurringSeries.userId, userId), isNull(recurringSeries.deletedAt)));
  if (!row) throw new ApiError(404, "NOT_FOUND", "Регулярный платёж не найден");
  return row;
}

export async function getSeries(userId: string, id: string) {
  const row = await getOwn(userId, id);
  const services = await servicesById([row.serviceId]);
  const list = await listSeries(userId, { status: [...SERIES_STATUSES] });
  const overlap = list.items.find((item) => item.id === id)?.overlapGroup ?? null;
  const recent = await db.select().from(transactions)
    .where(and(eq(transactions.recurringSeriesId, id), eq(transactions.userId, userId), isNull(transactions.deletedAt)))
    .orderBy(desc(transactions.localDate), desc(transactions.createdAt)).limit(12);
  return { ...toDto(row, row.serviceId ? services.get(row.serviceId) : undefined, overlap), transactions: recent.map((tx) => toTransactionDto(tx)) };
}

export interface SeriesPatch {
  displayName?: string;
  kind?: (typeof SERIES_KINDS)[number];
  categoryId?: string | null;
  remindDaysBefore?: number;
  status?: "confirmed" | "ignored" | "cancelled";
}

const confidenceBucket = (value: number) => (value < 0.7 ? "0.6-0.7" : value < 0.8 ? "0.7-0.8" : value < 0.9 ? "0.8-0.9" : "0.9+");

export async function updateSeries(userId: string, id: string, patch: SeriesPatch) {
  const row = await getOwn(userId, id);
  if (patch.status && row.status === "ended" && patch.status !== "confirmed") {
    throw new ApiError(400, "VALIDATION_ERROR", "Закончившийся платёж можно только подтвердить");
  }
  if (patch.categoryId) {
    const [category] = await db.select({ id: categories.id }).from(categories).where(and(
      eq(categories.id, patch.categoryId), isNull(categories.deletedAt), or(isNull(categories.userId), eq(categories.userId, userId)),
    ));
    if (!category) throw new ApiError(404, "NOT_FOUND", "Категория не найдена");
  }
  const statusChanged = patch.status && patch.status !== row.status;
  await db.update(recurringSeries).set({
    ...(patch.displayName !== undefined ? { displayName: patch.displayName } : {}),
    ...(patch.kind !== undefined ? { kind: patch.kind } : {}),
    ...(patch.categoryId !== undefined ? { categoryId: patch.categoryId } : {}),
    ...(patch.remindDaysBefore !== undefined ? { remindDaysBefore: patch.remindDaysBefore } : {}),
    ...(statusChanged ? { status: patch.status, cancelledAt: patch.status === "cancelled" ? new Date() : null } : {}),
    updatedAt: new Date(),
  }).where(eq(recurringSeries.id, row.id));

  if (statusChanged) {
    const service = row.serviceId ? (await servicesById([row.serviceId])).get(row.serviceId) : undefined;
    const kind = patch.kind ?? row.kind;
    if (patch.status === "confirmed") void track("recurring_confirmed", { userId, props: { kind, has_service: Boolean(service) } });
    if (patch.status === "ignored") void track("recurring_ignored", { userId, props: { kind, confidence_bucket: confidenceBucket(row.confidence) } });
    if (patch.status === "cancelled") void track("recurring_marked_cancelled", { userId, props: { kind, service_group: service?.serviceGroup ?? null } });
  }
  return getSeries(userId, id);
}

/** Ближайшая периодичность для ручной серии: пользователь уже сказал, что платёж регулярный. */
function nearestPeriodicity(days: number): Periodicity {
  if (days < 11) return "weekly";
  if (days < 22) return "biweekly";
  if (days <= 60) return "monthly";
  if (days < 180) return "quarterly";
  return "yearly";
}

/** Ручная серия из отмеченных операций: подтверждена сразу; совпала с найденной — та подтверждается. */
export async function createManualSeries(userId: string, input: { transactionIds: string[]; displayName?: string; kind?: SeriesPatch["kind"] }) {
  const ids = [...new Set(input.transactionIds)];
  const rows = await db.select().from(transactions)
    .where(and(inArray(transactions.id, ids), eq(transactions.userId, userId), isNull(transactions.deletedAt)));
  if (rows.length !== ids.length) throw new ApiError(404, "NOT_FOUND", "Операция не найдена");
  if (rows.some((row) => row.type !== "expense" && row.type !== "income")) throw new ApiError(400, "VALIDATION_ERROR", "Регулярным может быть только расход или доход");
  if (new Set(rows.map((row) => row.type)).size > 1) throw new ApiError(400, "VALIDATION_ERROR", "У операций разные направления: расход и доход");
  if (new Set(rows.map((row) => row.currency ?? "RUB")).size > 1) throw new ApiError(400, "VALIDATION_ERROR", "У операций разные валюты");

  rows.sort((a, b) => a.localDate.localeCompare(b.localDate));
  const dates = [...new Set(rows.map((row) => row.localDate))];
  if (dates.length < 2) throw new ApiError(400, "VALIDATION_ERROR", "Нужны операции хотя бы за две разные даты");
  const intervals = dates.slice(1).map((date, i) => daysBetween(dates[i], date)).sort((a, b) => a - b);
  // медиана: при чётном числе интервалов — среднее двух средних (60 и 28 дней → 44, ежемесячно)
  const middle = Math.floor(intervals.length / 2);
  const interval = intervals.length % 2 ? intervals[middle] : Math.round((intervals[middle - 1] + intervals[middle]) / 2);
  const periodicity = nearestPeriodicity(interval);
  const amounts = rows.map((row) => toKopecks(row.amount.replace("-", ""))).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const last = rows[rows.length - 1];
  const lastAmount = toKopecks(last.amount.replace("-", ""));
  const direction = last.type === "income" ? "in" : "out";
  const groupKey = groupKeyOf(last) || `manual ${randomUUID()}`;
  const currency = last.currency ?? "RUB";
  const nextExpected = step(last.localDate, periodicity);

  const stats = {
    displayName: (input.displayName ?? (last.merchant?.trim() || last.description.trim())).slice(0, 120),
    kind: input.kind ?? (direction === "in" ? "other" : "subscription"),
    accountId: last.accountId,
    categoryId: last.categoryId,
    periodicity,
    intervalDays: interval,
    amountLast: fromKopecks(lastAmount),
    amountMedian: fromKopecks(amounts[Math.floor(amounts.length / 2)]),
    amountMin: fromKopecks(amounts[0]),
    amountMax: fromKopecks(amounts[amounts.length - 1]),
    occurrences: dates.length,
    firstDate: dates[0],
    lastDate: last.localDate,
    nextExpectedDate: nextExpected,
    expectedAmount: fromKopecks(lastAmount),
    confidence: 1,
    status: "confirmed" as const,
    source: "manual",
    updatedAt: new Date(),
  };
  const id = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(recurringSeries).where(and(
      eq(recurringSeries.userId, userId), eq(recurringSeries.direction, direction), eq(recurringSeries.groupKey, groupKey), eq(recurringSeries.currency, currency),
    ));
    let seriesId: string;
    if (existing) {
      await tx.update(recurringSeries).set({ ...stats, deletedAt: null, cancelledAt: null }).where(eq(recurringSeries.id, existing.id));
      seriesId = existing.id;
    } else {
      const [created] = await tx.insert(recurringSeries).values({ userId, groupKey, direction, currency, ...stats }).returning({ id: recurringSeries.id });
      seriesId = created.id;
    }
    await tx.update(transactions).set({ recurringSeriesId: seriesId }).where(and(eq(transactions.userId, userId), inArray(transactions.id, ids)));
    return seriesId;
  });
  void track("recurring_confirmed", { userId, props: { kind: stats.kind, has_service: false } });
  return getSeries(userId, id);
}
