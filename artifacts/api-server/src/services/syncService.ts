/**
 * Синхронизация приложения (E2.1-T4): GET /api/v1/sync отдаёт изменения восьми таблиц по курсору.
 *
 * Курсор — не по updated_at: строка, записанная долгой транзакцией (импорт), получает время начала
 * транзакции, а видна становится после коммита — клиент, прошедший это время, её бы пропустил.
 * Вместо времени каждая строка хранит номер записавшей её транзакции (sync_xid, ставит триггер),
 * а раунд синхронизации запоминает xmin снимка — номер старейшей незавершённой транзакции.
 * Всё, что записано транзакциями младше xmin, уже видно; следующий раунд берёт строки с sync_xid >= xmin
 * прошлого раунда. Часть строк приходит повторно — клиент делает upsert по id, это безвредно.
 *
 * Раунд листается страницами: сущности по порядку (счета и категории — раньше операций), внутри —
 * по (sync_xid, id). Первый раунд (без курсора) — полный снимок без удалённых; следующие отдают
 * удалённые как надгробия (id в deleted). Курсору раунда больше 90 дней — 410 CURSOR_EXPIRED:
 * клиент делает полный ресинк.
 */
import { and, asc, eq, isNull, or, sql, type SQL } from "drizzle-orm";
import {
  accounts, budgets, categories, categoryRules, goalContributions, recurringSeries, savingsGoals, transactions, userCategoryPrefs,
  type Budget, type RecurringSeries, type SavingsGoal,
} from "@shared/schema";
import { z } from "zod";
import { db } from "../db";
import { ApiError } from "../lib/apiError";
import { toAccountDtos, toTransactionDto } from "./ledgerService";
import { toRuleDto } from "./categorization/rules";

export const SYNC_ENTITIES = ["accounts", "categories", "transactions", "budgets", "goals", "goalContributions", "recurring", "rules"] as const;
export type SyncEntity = (typeof SYNC_ENTITIES)[number];

export const CURSOR_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;
export const SYNC_DEFAULT_LIMIT = 500;
export const SYNC_MAX_LIMIT = 1000;

const cursorSchema = z.object({
  v: z.literal(1),
  /** Нижняя граница раунда — xmin прошлого раунда; null — полный снимок. */
  lo: z.string().regex(/^\d+$/).nullable(),
  /** Когда снят lo, мс — для срока жизни курсора. */
  t: z.number().int().nonnegative(),
  /** xmin этого раунда и когда он снят; null — раунд ещё не начат (снимется на следующем запросе). */
  w: z.string().regex(/^\d+$/).nullable(),
  wt: z.number().int().nonnegative().nullable(),
  /** Позиция внутри раунда: номер сущности и последний отданный (sync_xid, id). */
  e: z.number().int().min(0).max(SYNC_ENTITIES.length),
  x: z.string().regex(/^\d+$/).nullable(),
  id: z.string().uuid().nullable(),
});
type Cursor = z.infer<typeof cursorSchema>;

const encodeCursor = (cursor: Cursor) => Buffer.from(JSON.stringify(cursor)).toString("base64url");

function decodeCursor(raw: string): Cursor {
  try {
    const parsed = cursorSchema.safeParse(JSON.parse(Buffer.from(raw, "base64url").toString("utf8")));
    if (parsed.success) return parsed.data;
  } catch { /* ниже — общая ошибка */ }
  throw new ApiError(400, "VALIDATION_ERROR", "Некорректный курсор");
}

interface Row {
  id: string;
  xid: string;
  deleted: boolean;
}

interface EntitySource<T> {
  /** Строки пользователя с номером транзакции после (x, id) и не ниже lo, по порядку. */
  fetch(userId: string, filter: { lo: string | null; after: { x: string; id: string } | null; limit: number }): Promise<(Row & { data: T })[]>;
  toDtos(rows: T[]): Promise<unknown[]> | unknown[];
}

const iso = (value: Date | null) => (value ? value.toISOString() : null);

const toBudgetDto = (row: Budget) => ({
  id: row.id, categoryId: row.categoryId, amount: row.amount, period: row.period, effectiveFrom: row.effectiveFrom,
  effectiveTo: row.effectiveTo, rollover: row.rollover, excludedCategoryIds: row.excludedCategoryIds,
  alertThresholds: row.alertThresholds, createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt),
});

const toGoalDto = (row: SavingsGoal) => ({
  id: row.id, name: row.name, description: row.description, targetAmount: row.targetAmount, targetDate: row.targetDate,
  accountId: row.accountId, accountBaseline: row.accountBaseline, icon: row.icon, color: row.color,
  completedAt: iso(row.completedAt), archivedAt: iso(row.archivedAt), createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt),
});

const toContributionDto = (row: typeof goalContributions.$inferSelect) => ({
  id: row.id, goalId: row.goalId, amount: row.amount, date: row.date, note: row.note, transactionId: row.transactionId,
  createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt),
});

const toSeriesDto = (row: RecurringSeries) => ({
  id: row.id, displayName: row.displayName, direction: row.direction, kind: row.kind, serviceId: row.serviceId,
  accountId: row.accountId, categoryId: row.categoryId, currency: row.currency, periodicity: row.periodicity,
  intervalDays: row.intervalDays, amountLast: row.amountLast, amountMedian: row.amountMedian, amountPrevious: row.amountPrevious,
  priceChangedAt: row.priceChangedAt, occurrences: row.occurrences, firstDate: row.firstDate, lastDate: row.lastDate,
  nextExpectedDate: row.nextExpectedDate, expectedAmount: row.expectedAmount, confidence: row.confidence, source: row.source,
  status: row.status, remindDaysBefore: row.remindDaysBefore, cancelledAt: iso(row.cancelledAt),
  createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt),
});

type SyncTable = typeof accounts | typeof transactions | typeof budgets | typeof savingsGoals | typeof goalContributions | typeof recurringSeries | typeof categoryRules;

/** Таблица с user_id, sync_xid и deleted_at: одинаковый запрос по индексу (user_id, sync_xid, id). */
function tableSource<T extends { id: string; syncXid: number; deletedAt: Date | null }>(
  table: SyncTable,
  toDtos: (rows: T[]) => Promise<unknown[]> | unknown[],
): EntitySource<T> {
  return {
    async fetch(userId, { lo, after, limit }) {
      const conditions: (SQL | undefined)[] = [
        eq(table.userId, userId),
        lo === null ? isNull(table.deletedAt) : sql`${table.syncXid} >= ${lo}::bigint`,
        after ? sql`(${table.syncXid}, ${table.id}) > (${after.x}::bigint, ${after.id}::uuid)` : undefined,
      ];
      const rows = (await db.select().from(table).where(and(...conditions)).orderBy(asc(table.syncXid), asc(table.id)).limit(limit)) as unknown as T[];
      return rows.map((data) => ({ id: data.id, xid: data.syncXid.toString(), deleted: data.deletedAt !== null, data }));
    },
    toDtos,
  };
}

/** Категории: системные (общие) и свои, с личными скрытием и названием — изменение настройки тоже изменение категории. */
const categoriesSource: EntitySource<{ category: typeof categories.$inferSelect; hidden: boolean; customName: string | null }> = {
  async fetch(userId, { lo, after, limit }) {
    const xid = sql<string>`greatest(${categories.syncXid}, coalesce(${userCategoryPrefs.syncXid}, 0))`;
    const rows = await db
      .select({ category: categories, hidden: userCategoryPrefs.hidden, customName: userCategoryPrefs.customName, xid: sql<string>`${xid}::text` })
      .from(categories)
      .leftJoin(userCategoryPrefs, and(eq(userCategoryPrefs.categoryId, categories.id), eq(userCategoryPrefs.userId, userId)))
      .where(and(
        or(isNull(categories.userId), eq(categories.userId, userId)),
        lo === null ? isNull(categories.deletedAt) : sql`${xid} >= ${lo}::bigint`,
        after ? sql`(${xid}, ${categories.id}) > (${after.x}::bigint, ${after.id}::uuid)` : undefined,
      ))
      .orderBy(asc(xid), asc(categories.id))
      .limit(limit);
    return rows.map((row) => ({
      id: row.category.id,
      xid: row.xid,
      deleted: row.category.deletedAt !== null,
      data: { category: row.category, hidden: row.hidden ?? false, customName: row.customName },
    }));
  },
  toDtos: (rows) => rows.map(({ category, hidden, customName }) => ({
    id: category.id, parentId: category.parentId, code: category.code, name: customName ?? category.name, kind: category.kind,
    icon: category.icon, color: category.color, taxDeduction: category.taxDeduction, sortOrder: category.sortOrder,
    isSystem: category.userId === null, hidden, updatedAt: iso(category.updatedAt),
  })),
};

const SOURCES: Record<SyncEntity, EntitySource<any>> = {
  accounts: tableSource(accounts, toAccountDtos),
  categories: categoriesSource,
  transactions: tableSource(transactions, (rows) => rows.map((row) => toTransactionDto(row))),
  budgets: tableSource(budgets, (rows) => rows.map(toBudgetDto)),
  goals: tableSource(savingsGoals, (rows) => rows.map(toGoalDto)),
  goalContributions: tableSource(goalContributions, (rows) => rows.map(toContributionDto)),
  recurring: tableSource(recurringSeries, (rows) => rows.map(toSeriesDto)),
  rules: tableSource(categoryRules, (rows) => rows.map(toRuleDto)),
};

export interface SyncPage {
  changes: Record<SyncEntity, unknown[]>;
  deleted: Record<SyncEntity, string[]>;
  nextCursor: string;
  hasMore: boolean;
}

/** xmin текущего снимка: все транзакции с меньшим номером завершены, их записи уже видны. */
async function snapshotXmin(): Promise<string> {
  const result = await db.execute(sql`select pg_snapshot_xmin(pg_current_snapshot())::text as xmin`);
  return String((result.rows[0] as { xmin: string }).xmin);
}

export async function syncPage(userId: string, rawCursor: string | undefined, limit = SYNC_DEFAULT_LIMIT, now = Date.now()): Promise<SyncPage> {
  let cursor: Cursor = rawCursor ? decodeCursor(rawCursor) : { v: 1, lo: null, t: now, w: null, wt: null, e: 0, x: null, id: null };
  if (cursor.lo !== null && now - cursor.t > CURSOR_MAX_AGE_MS) {
    throw new ApiError(410, "CURSOR_EXPIRED", "Данные на устройстве устарели — нужна полная синхронизация");
  }
  if (cursor.w === null) cursor = { ...cursor, w: await snapshotXmin(), wt: now };

  const changes = Object.fromEntries(SYNC_ENTITIES.map((entity) => [entity, [] as unknown[]])) as SyncPage["changes"];
  const deleted = Object.fromEntries(SYNC_ENTITIES.map((entity) => [entity, [] as string[]])) as SyncPage["deleted"];
  let remaining = limit;
  let position = { e: cursor.e, x: cursor.x, id: cursor.id };

  while (position.e < SYNC_ENTITIES.length && remaining > 0) {
    const entity = SYNC_ENTITIES[position.e];
    const source = SOURCES[entity];
    const after = position.x && position.id ? { x: position.x, id: position.id } : null;
    const rows = await source.fetch(userId, { lo: cursor.lo, after, limit: remaining + 1 });
    const page = rows.slice(0, remaining);
    const live = page.filter((row) => !row.deleted);
    changes[entity].push(...(await source.toDtos(live.map((row) => row.data))));
    deleted[entity].push(...page.filter((row) => row.deleted).map((row) => row.id));
    remaining -= page.length;
    if (rows.length > page.length) {
      const last = page[page.length - 1];
      position = { e: position.e, x: last.xid, id: last.id };
    } else {
      position = { e: position.e + 1, x: null, id: null };
    }
  }

  const hasMore = position.e < SYNC_ENTITIES.length;
  const next: Cursor = hasMore
    ? { ...cursor, e: position.e, x: position.x, id: position.id }
    // раунд закончен: следующий начнётся с xmin этого раунда, свой xmin снимет при первом запросе
    : { v: 1, lo: cursor.w, t: cursor.wt ?? now, w: null, wt: null, e: 0, x: null, id: null };
  return { changes, deleted, nextCursor: encodeCursor(next), hasMore };
}
