/**
 * Отправка push (E2.2-T2). notify() ставит задачу push.send на пользователя и тип уведомления; задача:
 * 1) проверяет настройку группы (notificationPrefs) — выключено, значит только колокольчик;
 * 2) в тихие часы по users.timezone откладывает себя до их конца (кроме безопасности);
 * 3) забирает все необработанные уведомления этого типа за сутки и шлёт одно сообщение — так однотипные объединяются;
 * 4) соблюдает лимит: не больше 3 push в сутки, кроме безопасности;
 * 5) шлёт на каждое устройство пользователя через адаптер провайдера, временные ошибки повторяет,
 *    недействительный токен снимает с устройства; каждую попытку пишет в push_deliveries (30 дней).
 * Без ключей провайдера (FCM_SERVICE_ACCOUNT, RUSTORE_PUSH_*, VAPID_*) push не уходят — остаются колокольчик и письма.
 */
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { authSessions, notifications, pushDeliveries, users } from "@shared/schema";
import { db } from "../../db";
import { logger } from "../logger";
import { channelEnabled, PREF_GROUPS, prefTypeOf } from "../notificationPrefs";
import { pushTargets, type PushProvider } from "../pushTokens";
import { createFcmAdapter, parseServiceAccount } from "./fcm";
import { createRuStoreAdapter, ruStoreConfigFromEnv } from "./rustore";
import type { PushAdapter, PushMessage, PushResult } from "./types";
import { createWebPushAdapter, vapidKeysFromEnv } from "./webpush";

export const DAILY_PUSH_LIMIT = 3;
const RETRY_DELAYS_MS = [1_000, 4_000];

// ---------- адаптеры ----------

let adapters: Map<PushProvider, PushAdapter> | null = null;
let retryDelays = RETRY_DELAYS_MS;

function adaptersFromEnv(): Map<PushProvider, PushAdapter> {
  const map = new Map<PushProvider, PushAdapter>();
  try {
    const account = parseServiceAccount(process.env.FCM_SERVICE_ACCOUNT);
    if (account) map.set("fcm", createFcmAdapter(account));
  } catch (error) {
    logger.error("FCM_SERVICE_ACCOUNT не разобран — push в Android не уходят:", error);
  }
  const rustore = ruStoreConfigFromEnv();
  if (rustore) map.set("rustore", createRuStoreAdapter(rustore));
  const vapid = vapidKeysFromEnv();
  if (vapid) map.set("webpush", createWebPushAdapter(vapid));
  return map;
}

const pushAdapters = () => (adapters ??= adaptersFromEnv());

/** Для тестов: свои адаптеры и задержки повторов. */
export function setPushAdaptersForTests(map: Map<PushProvider, PushAdapter> | null, delays: number[] = [0, 0]) {
  adapters = map;
  retryDelays = map ? delays : RETRY_DELAYS_MS;
}

/** Публичный ключ VAPID для подписки браузера; null — Web Push не настроен. */
export const vapidPublicKey = () => vapidKeysFromEnv()?.publicKey ?? null;

// ---------- тихие часы ----------

/** Час по местному времени пользователя. */
export function localHour(at: Date, timeZone: string): number {
  const hour = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone }).format(at);
  return Number(hour);
}

const inQuietHours = (hour: number, start: number, end: number) =>
  start === end ? false : start < end ? hour >= start && hour < end : hour >= start || hour < end;

/** Конец тихих часов (первый час с локальным часом end), если сейчас тихо; иначе null. */
export function quietUntil(now: Date, timeZone: string, start: number, end: number): Date | null {
  if (!inQuietHours(localHour(now, timeZone), start, end)) return null;
  const candidate = new Date(now);
  candidate.setUTCMinutes(0, 0, 0);
  for (let i = 0; i < 26; i++) {
    candidate.setUTCHours(candidate.getUTCHours() + 1);
    if (localHour(candidate, timeZone) === end) return candidate;
  }
  return null;
}

// ---------- текст ----------

/** «Скрывать суммы»: суммы с валютой заменяются на «•••». Проценты и даты остаются. */
export function maskAmounts(text: string): string {
  // число с разделителями разрядов: пробел внутри числа — только если за ним снова цифра
  return text
    .replace(/[-−+]?\d(?:[\d.,]|[   ](?=\d))*\s?(?:₽|руб\.?|рублей|рубля|рубль|RUB|\$|€|USD|EUR)/giu, "•••")
    .replace(/[-−+]?[₽$€]\s?\d(?:[\d.,]|[   ](?=\d))*/gu, "•••");
}

const plural = (n: number, one: string, few: string, many: string) => {
  const mod10 = n % 10, mod100 = n % 100;
  return mod10 === 1 && mod100 !== 11 ? one : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? few : many;
};

interface PendingNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  deepLink: string | null;
}

export function buildMessage(items: PendingNotification[], hideAmounts: boolean): PushMessage {
  const last = items[items.length - 1];
  const paths = new Set(items.map((item) => item.deepLink ?? "/"));
  const deepLink = paths.size === 1 ? [...paths][0] : "/";
  let title: string;
  let body: string;
  if (items.length === 1) {
    title = last.title;
    body = last.body ?? "";
  } else {
    const group = prefTypeOf(last.type);
    title = `${items.length} ${plural(items.length, "уведомление", "уведомления", "уведомлений")}: ${group ? PREF_GROUPS[group].label.toLowerCase() : "FinTrack"}`;
    body = items.map((item) => item.title).join(" · ");
  }
  const clean = (text: string) => (hideAmounts ? maskAmounts(text) : text);
  return {
    title: clean(title).slice(0, 120),
    body: clean(body).slice(0, 240),
    data: { notificationId: last.id, type: last.type, deepLink },
  };
}

// ---------- постановка в очередь ----------

const singletonKey = (userId: string, type: string) => `push:${userId}:${type}`;

/** После notify(): push по этому типу — задачей; без очереди (тесты, запуск без воркера) — сразу. */
export async function schedulePush(notification: { id: string; userId: string; type: string }): Promise<void> {
  if (!prefTypeOf(notification.type)) {
    // служебные уведомления (system) — только колокольчик
    await db.update(notifications).set({ pushProcessedAt: new Date() }).where(eq(notifications.id, notification.id));
    return;
  }
  const { enqueue, jobsBoss } = await import("../../jobs");
  const data = { userId: notification.userId, type: notification.type };
  if (jobsBoss()) {
    await enqueue("push.send", data, { singletonKey: singletonKey(notification.userId, notification.type) });
    return;
  }
  await deliverPush(data).catch((error) => logger.warn("push.send:", error));
}

// ---------- отправка ----------

export type PushOutcome = "sent" | "failed" | "disabled" | "deferred" | "nothing" | "capped" | "no_devices";

async function markProcessed(userId: string, type: string) {
  await db.update(notifications).set({ pushProcessedAt: new Date() })
    .where(and(eq(notifications.userId, userId), eq(notifications.type, type), isNull(notifications.pushProcessedAt)));
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function sendWithRetry(adapter: PushAdapter, token: string, message: PushMessage): Promise<PushResult> {
  let result = await adapter.send(token, message);
  for (const delay of retryDelays) {
    if (result.status !== "retry") break;
    await sleep(delay);
    result = await adapter.send(token, message);
  }
  return result;
}

export async function deliverPush({ userId, type }: { userId: string; type: string }, now = new Date()): Promise<PushOutcome> {
  const group = prefTypeOf(type);
  if (!group || !(await channelEnabled(userId, type, "push"))) {
    await markProcessed(userId, type);
    return "disabled";
  }
  const [user] = await db.select({ timezone: users.timezone, start: users.quietHoursStart, end: users.quietHoursEnd, hide: users.hidePushAmounts })
    .from(users).where(eq(users.id, userId));
  if (!user) return "nothing";

  const urgent = group === "security_alert";
  const until = urgent ? null : quietUntil(now, user.timezone, user.start, user.end);
  if (until) {
    const { enqueue, jobsBoss } = await import("../../jobs");
    // отдельный ключ: днём новые уведомления этого типа ставят свою задачу, а ночные ждут утра в одной
    if (jobsBoss()) await enqueue("push.send", { userId, type }, { startAfter: until, singletonKey: `${singletonKey(userId, type)}:quiet` });
    return "deferred";
  }

  const claimed = await db.update(notifications).set({ pushProcessedAt: now })
    .where(and(
      eq(notifications.userId, userId),
      eq(notifications.type, type),
      isNull(notifications.pushProcessedAt),
      gt(notifications.createdAt, new Date(now.getTime() - 24 * 60 * 60 * 1000)),
    ))
    .returning({ id: notifications.id, type: notifications.type, title: notifications.title, body: notifications.body, deepLink: notifications.deepLink, createdAt: notifications.createdAt });
  if (!claimed.length) return "nothing";
  claimed.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  if (!urgent) {
    const [{ sent }] = await db.select({ sent: sql<number>`count(distinct ${pushDeliveries.notificationId})::int` }).from(pushDeliveries)
      .where(and(eq(pushDeliveries.userId, userId), eq(pushDeliveries.status, "sent"), gt(pushDeliveries.createdAt, new Date(now.getTime() - 24 * 60 * 60 * 1000))));
    if (sent >= DAILY_PUSH_LIMIT) return "capped";
  }

  const targets = await pushTargets(userId);
  if (!targets.length) return "no_devices";

  const message = buildMessage(claimed, user.hide || urgent);
  let delivered = false;
  for (const target of targets) {
    const adapter = pushAdapters().get(target.provider);
    const result: PushResult | { status: "no_adapter" } = adapter ? await sendWithRetry(adapter, target.token, message) : { status: "no_adapter" };
    if (result.status === "sent") delivered = true;
    if (result.status === "invalid_token") {
      await db.update(authSessions).set({ pushProvider: null, pushToken: null, pushTokenUpdatedAt: null }).where(eq(authSessions.id, target.sessionId));
    }
    await db.insert(pushDeliveries).values({
      userId,
      notificationId: message.data.notificationId,
      sessionId: target.sessionId,
      provider: target.provider,
      status: result.status === "retry" ? "failed" : result.status,
      providerMessageId: result.status === "sent" ? result.providerMessageId?.slice(0, 200) ?? null : null,
      error: "error" in result ? result.error : null,
    });
  }
  return delivered ? "sent" : "failed";
}

/** Журнал доставок — 30 дней (cleanup.notifications). */
export async function cleanupPushDeliveries(): Promise<number> {
  const deleted = await db.delete(pushDeliveries).where(sql`${pushDeliveries.createdAt} < now() - interval '30 days'`).returning({ id: pushDeliveries.id });
  return deleted.length;
}
