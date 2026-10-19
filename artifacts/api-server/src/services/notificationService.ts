import { and, count, desc, eq, isNull, sql, type SQL } from "drizzle-orm";
import { notifications, type Notification, NOTIFICATION_TYPES } from "@shared/schema";
import { db } from "../db";
import { ApiError } from "../lib/apiError";

/** In-app уведомления (E1.0-T4): создают их эпики (бюджеты, подписки, импорт), читает колокольчик в шапке. */

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface NotificationInput {
  type: NotificationType;
  title: string;
  body?: string | null;
  /** Относительный путь SPA, например /budgets?month=2026-10 */
  deepLink?: string | null;
  payload?: Record<string, unknown>;
  /** budget:<id>:2026-10:80 — второе такое же уведомление не создаётся */
  dedupKey?: string | null;
}

export interface NotificationDto {
  id: string;
  type: string;
  title: string;
  body: string | null;
  deepLink: string | null;
  payload: unknown;
  readAt: Date | null;
  createdAt: Date;
}

const toDto = (row: Notification): NotificationDto => ({
  id: row.id,
  type: row.type,
  title: row.title,
  body: row.body,
  deepLink: row.deepLink,
  payload: row.payload,
  readAt: row.readAt,
  createdAt: row.createdAt,
});

const isSafeLink = (link: string) => link.startsWith("/") && !link.startsWith("//") && !link.startsWith("/\\");

/** Создаёт уведомление; с тем же dedupKey повторно — нет (возвращает null). */
export async function notify(userId: string, input: NotificationInput): Promise<NotificationDto | null> {
  if (input.deepLink && !isSafeLink(input.deepLink)) throw new Error(`deepLink должен быть путём SPA: ${input.deepLink}`);
  const [row] = await db.insert(notifications).values({
    userId,
    type: input.type,
    title: input.title.slice(0, 140),
    body: input.body ?? null,
    deepLink: input.deepLink ?? null,
    payload: input.payload ?? {},
    dedupKey: input.dedupKey ?? null,
  }).onConflictDoNothing({ target: [notifications.userId, notifications.dedupKey] }).returning();
  return row ? toDto(row) : null;
}

const encodeCursor = (createdAt: string, id: string) => Buffer.from(JSON.stringify([createdAt, id])).toString("base64url");
function decodeCursor(cursor: string): [string, string] {
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (Array.isArray(value) && value.length === 2 && value.every((part) => typeof part === "string")) return value as [string, string];
  } catch { /* ниже — общая ошибка */ }
  throw new ApiError(400, "VALIDATION_ERROR", "Некорректный курсор");
}

export async function listNotifications(userId: string, options: { limit: number; cursor?: string; unreadOnly?: boolean }) {
  const conditions: SQL[] = [eq(notifications.userId, userId)];
  if (options.unreadOnly) conditions.push(isNull(notifications.readAt));
  if (options.cursor) {
    const [createdAt, id] = decodeCursor(options.cursor);
    conditions.push(sql`(${notifications.createdAt}, ${notifications.id}) < (${createdAt}::timestamptz, ${id}::uuid)`);
  }
  const rows = await db.select({
    row: notifications,
    // микросекунды: иначе две записи в одну миллисекунду ломают курсор
    createdAtText: sql<string>`to_char(${notifications.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
  }).from(notifications).where(and(...conditions))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(options.limit + 1);
  const page = rows.slice(0, options.limit);
  const last = page[page.length - 1];
  const [{ unread }] = await db.select({ unread: count() }).from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return {
    items: page.map((item) => toDto(item.row)),
    nextCursor: rows.length > options.limit && last ? encodeCursor(last.createdAtText, last.row.id) : null,
    unreadCount: unread,
  };
}

/** Чужое уведомление неотличимо от несуществующего: 404. Повторное прочтение ничего не меняет. */
export async function markRead(userId: string, id: string): Promise<void> {
  const [row] = await db.select({ readAt: notifications.readAt }).from(notifications)
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
  if (!row) throw new ApiError(404, "NOT_FOUND", "Уведомление не найдено");
  if (!row.readAt) {
    await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
  }
}

export async function markAllRead(userId: string): Promise<number> {
  const updated = await db.update(notifications).set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
    .returning({ id: notifications.id });
  return updated.length;
}

/** Ежедневная чистка: прочитанные старше 90 дней. */
export async function cleanupNotifications(): Promise<number> {
  const deleted = await db.delete(notifications)
    .where(sql`${notifications.readAt} is not null and ${notifications.readAt} < now() - interval '90 days'`)
    .returning({ id: notifications.id });
  return deleted.length;
}
