import { toAppPath } from "../lib/links";

/**
 * Что приложение делает с пришедшим push (E2.2-T4) — без React Native, покрыто тестами.
 * В данных push только notificationId, type и deepLink (путь сайта); тихий push «данные обновились» — { type: "sync" }.
 */

/** Тихий push: синхронизироваться, ничего не показывать. */
export const isSyncPush = (data: unknown): boolean =>
  typeof data === "object" && data !== null && (data as Record<string, unknown>).type === "sync";

/** Экран, который открывает нажатие на уведомление; null — тихий push или данных нет. */
export function pushPath(data: unknown): string | null {
  if (typeof data !== "object" || data === null || isSyncPush(data)) return null;
  const deepLink = (data as Record<string, unknown>).deepLink;
  if (typeof deepLink !== "string" || !deepLink.startsWith("/")) return null;
  return toAppPath(deepLink);
}

/** «Не сейчас» — снова предложим не раньше чем через две недели. */
export const REMIND_AGAIN_MS = 14 * 86_400_000;

export interface ReminderState {
  status: "granted" | "denied" | "undetermined";
  /** Можно ли показать системный запрос: после отказа «больше не спрашивать» — только в настройках телефона. */
  canAskAgain: boolean;
  dismissedAt: number | null;
  now: number;
}

/** Предложить включить уведомления после первой ценности (например, после импорта): только если ещё не разрешены. */
export function shouldOfferReminders({ status, canAskAgain, dismissedAt, now }: ReminderState): boolean {
  if (status === "granted" || !canAskAgain) return false;
  return dismissedAt === null || now - dismissedAt >= REMIND_AGAIN_MS;
}
