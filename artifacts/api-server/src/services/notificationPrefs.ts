/**
 * Настройки уведомлений (E2.2-T1): группа × канал (push, письмо), тихие часы и «скрывать суммы в push».
 * Колокольчик в приложении не отключается: это история уведомлений, по ней же уходят push и письма.
 * Строки в notification_prefs нет — действуют значения по умолчанию группы.
 */
import { and, eq } from "drizzle-orm";
import { notificationPrefs, users, NOTIFICATION_PREF_TYPES, NOTIFICATION_TYPES } from "@shared/schema";
import { db } from "../db";
import { emailSettings } from "./notificationEmailService";

export type PrefType = (typeof NOTIFICATION_PREF_TYPES)[number];
type NotificationType = (typeof NOTIFICATION_TYPES)[number];
export type Channel = "push" | "email";

interface PrefGroup {
  label: string;
  /** Типы notifications, которые входят в группу (security_alert и product_news появятся в E2.7 и позже) */
  types: readonly NotificationType[];
  defaults: Record<Channel, boolean>;
  /** Есть ли письма у группы (D19); у остальных переключатель письма не показываем */
  emailAvailable: boolean;
}

export const PREF_GROUPS: Record<PrefType, PrefGroup> = {
  budget_threshold: { label: "Бюджеты: 80% и перерасход", types: ["budget_threshold"], defaults: { push: true, email: true }, emailAvailable: true },
  recurring_upcoming: { label: "Скорое списание подписки", types: ["recurring_upcoming"], defaults: { push: true, email: true }, emailAvailable: true },
  recurring_new: { label: "Новые подписки и списания после отмены", types: ["recurring_new", "recurring_after_cancel"], defaults: { push: true, email: true }, emailAvailable: true },
  goal_reached: { label: "Цели", types: ["goal_reached"], defaults: { push: true, email: false }, emailAvailable: false },
  import: { label: "Выписки: загрузка и напоминания", types: ["import_done"], defaults: { push: true, email: false }, emailAvailable: false },
  security_alert: { label: "Безопасность: необычные списания", types: [], defaults: { push: true, email: true }, emailAvailable: true },
  // реклама и новости — только с согласия (38-ФЗ «О рекламе»), поэтому по умолчанию выключено
  product_news: { label: "Новости FinTrack", types: [], defaults: { push: false, email: false }, emailAvailable: true },
};

/** Группа типа уведомления; system и прочие служебные — без группы: только колокольчик. */
export function prefTypeOf(type: string): PrefType | null {
  return (Object.keys(PREF_GROUPS) as PrefType[]).find((key) => (PREF_GROUPS[key].types as readonly string[]).includes(type)) ?? null;
}

export interface PrefsDto {
  groups: { type: PrefType; label: string; push: boolean; email: boolean; emailAvailable: boolean }[];
  quietHours: { start: number; end: number };
  hidePushAmounts: boolean;
  /** Общий переключатель писем и адрес (D19) — как в GET /notifications/settings */
  email: { enabled: boolean; address: string | null; addressVerified: boolean };
}

export async function getPrefs(userId: string): Promise<PrefsDto> {
  const [rows, [user], email] = await Promise.all([
    db.select().from(notificationPrefs).where(eq(notificationPrefs.userId, userId)),
    db.select({ start: users.quietHoursStart, end: users.quietHoursEnd, hide: users.hidePushAmounts }).from(users).where(eq(users.id, userId)),
    emailSettings(userId),
  ]);
  const saved = new Map(rows.map((row) => [row.type, row]));
  return {
    groups: NOTIFICATION_PREF_TYPES.map((type) => {
      const group = PREF_GROUPS[type];
      const row = saved.get(type);
      return {
        type,
        label: group.label,
        push: row?.push ?? group.defaults.push,
        email: group.emailAvailable && (row?.email ?? group.defaults.email),
        emailAvailable: group.emailAvailable,
      };
    }),
    quietHours: { start: user?.start ?? 22, end: user?.end ?? 9 },
    hidePushAmounts: Boolean(user?.hide),
    email: { enabled: email.email, address: email.address, addressVerified: email.addressVerified },
  };
}

export interface PrefsUpdate {
  groups?: { type: PrefType; push?: boolean; email?: boolean }[];
  quietHours?: { start: number; end: number };
  hidePushAmounts?: boolean;
}

export async function updatePrefs(userId: string, update: PrefsUpdate): Promise<PrefsDto> {
  await db.transaction(async (tx) => {
    if (update.groups?.length) {
      const current = new Map((await tx.select().from(notificationPrefs).where(eq(notificationPrefs.userId, userId))).map((row) => [row.type, row]));
      for (const change of update.groups) {
        const group = PREF_GROUPS[change.type];
        const base = current.get(change.type) ?? group.defaults;
        const push = change.push ?? base.push;
        const email = group.emailAvailable ? (change.email ?? base.email) : false;
        await tx.insert(notificationPrefs).values({ userId, type: change.type, push, email })
          .onConflictDoUpdate({ target: [notificationPrefs.userId, notificationPrefs.type], set: { push, email, updatedAt: new Date() } });
      }
    }
    if (update.quietHours || update.hidePushAmounts !== undefined) {
      await tx.update(users).set({
        ...(update.quietHours ? { quietHoursStart: update.quietHours.start, quietHoursEnd: update.quietHours.end } : {}),
        ...(update.hidePushAmounts !== undefined ? { hidePushAmounts: update.hidePushAmounts } : {}),
        updatedAt: new Date(),
      }).where(eq(users.id, userId));
    }
  });
  return getPrefs(userId);
}

/**
 * Включён ли канал для уведомления этого типа. Письмо уходит только по явному вызову emailNotification (D19),
 * поэтому у типа без группы (system) письмо решает вызывающий, а push не шлём.
 */
export async function channelEnabled(userId: string, notificationType: string, channel: Channel): Promise<boolean> {
  const type = prefTypeOf(notificationType);
  if (!type) return channel === "email";
  const group = PREF_GROUPS[type];
  if (channel === "email" && !group.emailAvailable) return false;
  const [row] = await db.select().from(notificationPrefs).where(and(eq(notificationPrefs.userId, userId), eq(notificationPrefs.type, type)));
  return row ? row[channel] : group.defaults[channel];
}
