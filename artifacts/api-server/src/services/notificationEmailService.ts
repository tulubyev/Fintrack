/**
 * Письма о важных уведомлениях (решение D19, #93): перерасход бюджета, годовая подписка и конец пробного периода,
 * списание после отмены. Письмо уходит, только если у пользователя подтверждён e-mail, не выключен переключатель
 * «Письма об уведомлениях» и письма не отключены для группы этого уведомления (notificationPrefs, E2.2). Отправка — задачей notifications.email; notifications.emailed_at не даёт отправить дважды.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { notifications, users, type Notification } from "@shared/schema";
import { db } from "../db";
import { track } from "./analytics";
import { emailService } from "./emailService";
import { logger } from "./logger";
import { channelEnabled } from "./notificationPrefs";

/** Адрес сайта для ссылок в письме: FRONTEND_URL — список через запятую, берём первый абсолютный адрес. */
function appUrl(): string {
  const candidates = [...(process.env.FRONTEND_URL ?? "").split(","), process.env.BASE_URL ?? ""].map((value) => value.trim());
  return (candidates.find((value) => /^https?:\/\/[^/]/.test(value)) ?? "https://fin-wall.ru").replace(/\/$/, "");
}

// ---------- ссылка «Отписаться» ----------

function signature(userId: string): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET не настроен");
  return createHmac("sha256", secret).update(`email-unsubscribe:${userId}`).digest("base64url");
}

export const unsubscribeToken = (userId: string) => `${userId}.${signature(userId)}`;

/** userId из токена «Отписаться» или null, если подпись не сходится. */
export function verifyUnsubscribeToken(token: string): string | null {
  const [userId, sig] = token.split(".");
  if (!userId || !sig || !/^[0-9a-f-]{36}$/i.test(userId)) return null;
  const expected = Buffer.from(signature(userId));
  const actual = Buffer.from(sig);
  return expected.length === actual.length && timingSafeEqual(expected, actual) ? userId : null;
}

export async function setEmailNotifications(userId: string, enabled: boolean) {
  await db.update(users).set({ emailNotifications: enabled, updatedAt: new Date() }).where(eq(users.id, userId));
}

export async function emailSettings(userId: string) {
  const [user] = await db.select({ email: users.email, verified: users.isEmailVerified, enabled: users.emailNotifications })
    .from(users).where(eq(users.id, userId));
  return { email: Boolean(user?.enabled), address: user?.email ?? null, addressVerified: Boolean(user?.verified) };
}

// ---------- письмо ----------

const escape = (text: string) => text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function renderEmail(notification: Pick<Notification, "title" | "body" | "deepLink">, userId: string) {
  const open = `${appUrl()}${notification.deepLink ?? "/"}`;
  const unsubscribe = `${appUrl()}/api/v1/email/unsubscribe?token=${encodeURIComponent(unsubscribeToken(userId))}`;
  const html = `<!DOCTYPE html>
<html lang="ru"><head><meta charset="utf-8"><title>${escape(notification.title)}</title></head>
<body style="margin:0;padding:24px;background:#f5f7fa;font-family:Segoe UI,Arial,sans-serif;color:#1f2937">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:28px">
    <p style="margin:0 0 4px;color:#0080ff;font-weight:600">FinTrack</p>
    <h1 style="margin:0 0 12px;font-size:20px">${escape(notification.title)}</h1>
    ${notification.body ? `<p style="margin:0 0 20px;line-height:1.5">${escape(notification.body)}</p>` : ""}
    <a href="${escape(open)}" style="display:inline-block;background:#0080ff;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px">Открыть в FinTrack</a>
    <p style="margin:28px 0 0;font-size:12px;color:#6b7280">
      Вы получили письмо, потому что включены письма об уведомлениях.
      <a href="${escape(unsubscribe)}" style="color:#6b7280">Отписаться</a> — уведомления останутся в приложении.
    </p>
  </div>
</body></html>`;
  const text = [notification.title, notification.body ?? "", `Открыть: ${open}`, "", `Отписаться: ${unsubscribe}`].join("\n");
  return { subject: notification.title, html, text };
}

/**
 * Отправить письмо по уведомлению. Повторный вызов (повтор задачи) ничего не шлёт: emailed_at ставится до отправки
 * и снимается, если SMTP ответил ошибкой — тогда задача повторится.
 */
export async function deliverNotificationEmail(notificationId: string): Promise<"sent" | "skipped"> {
  const [row] = await db.select({ notification: notifications, email: users.email, verified: users.isEmailVerified, enabled: users.emailNotifications })
    .from(notifications).innerJoin(users, eq(users.id, notifications.userId)).where(eq(notifications.id, notificationId));
  if (!row || row.notification.emailedAt || !row.email || !row.verified || !row.enabled) return "skipped";
  if (!(await channelEnabled(row.notification.userId, row.notification.type, "email"))) return "skipped";

  const [claimed] = await db.update(notifications).set({ emailedAt: new Date() })
    .where(and(eq(notifications.id, notificationId), isNull(notifications.emailedAt))).returning({ id: notifications.id });
  if (!claimed) return "skipped";

  const result = await emailService.sendEmail({ to: row.email, ...renderEmail(row.notification, row.notification.userId) });
  if (!result.success) {
    await db.update(notifications).set({ emailedAt: null }).where(eq(notifications.id, notificationId));
    throw new Error(`Письмо об уведомлении не отправлено: ${result.error}`);
  }
  void track("notification_email_sent", { userId: row.notification.userId, props: { type: row.notification.type } });
  return "sent";
}

/** Поставить письмо в очередь; без очереди (тесты, запуск без воркера) — отправить сразу, не роняя вызывающего. */
export async function emailNotification(notification: { id: string } | null): Promise<void> {
  if (!notification) return;
  const { enqueue, jobsBoss } = await import("../jobs");
  if (jobsBoss()) {
    await enqueue("notifications.email", { notificationId: notification.id }, { singletonKey: notification.id });
    return;
  }
  await deliverNotificationEmail(notification.id).catch((error) => logger.warn("notifications.email:", error));
}
