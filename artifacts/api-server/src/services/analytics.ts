/**
 * Продуктовые события (решение D10): своя таблица product_events, данные не уходят третьим лицам.
 *
 * - Список событий закрытый: неизвестное имя отбрасывается, а не пишется «на всякий случай».
 * - В props не должно быть ПДн: строки, похожие на e-mail, телефон или номер карты, вырезаются с предупреждением в логе.
 * - Серверный track() никогда не роняет запрос: событие — не бизнес-данные.
 */
import { lt } from "drizzle-orm";
import { productEvents, type InsertProductEvent } from "@shared/schema";
import { db } from "../db";
import { logger } from "./logger";

// Новое событие — сюда и в таблицу «События аналитики» спецификации эпика
export const EVENT_NAMES = [
  "app_opened",
  "auth_signed_up",
  "auth_logged_in",
  "notification_shown",
  "notification_clicked",
  "account_created",
  "account_archived",
  "balance_adjusted",
  "transaction_created",
  "transaction_updated",
  "transaction_deleted",
  "transactions_bulk_updated",
  "transfer_created",
  "transfer_linked",
  "transfer_suggestion_shown",
  "budget_created",
  "budget_updated",
  "budget_suggestions_shown",
  "budget_threshold_reached",
  "goal_created",
  "goal_contribution_added",
  "goal_completed",
  "recurring_detected",
  "recurring_price_changed",
  "recurring_confirmed",
  "recurring_ignored",
  "recurring_marked_cancelled",
  "recurring_cancel_guide_opened",
  "recurring_reminder_sent",
  "recurring_charged_after_cancel",
  "dashboard_viewed",
  "dashboard_block_clicked",
  "onboarding_started",
  "onboarding_step_completed",
  "onboarding_dismissed",
  "notification_email_sent",
  "category_created",
  "category_changed",
  "category_rule_created",
  "llm_categorization_batch",
  "uncategorized_review_opened",
  "import_instructions_opened",
  "import_started",
  "import_parsed",
  "import_mapping_required",
  "import_completed",
  "import_failed",
  "import_undone",
  "site_page_viewed",
  "site_cta_clicked",
] as const;
export type EventName = (typeof EVENT_NAMES)[number];

export const CLIENT_PLATFORMS = ["web", "pwa", "android", "ios"] as const;

const MAX_PROPS = 30;
const MAX_KEY_LENGTH = 40;
const MAX_STRING_LENGTH = 200;

const PII_PATTERNS: Array<[string, RegExp]> = [
  ["email", /[^\s@]+@[^\s@]+\.[^\s@]+/],
  ["phone", /(?:\+7|(?<!\d)8)[\s(-]*\d{3}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}(?!\d)/],
  ["card", /(?<!\d)(?:\d[ -]?){15}\d(?!\d)/],
];

export function isEventName(name: string): name is EventName {
  return (EVENT_NAMES as readonly string[]).includes(name);
}

/**
 * Оставляет в props только простые значения (строка, число, boolean, null) без ПДн.
 * Возвращает чистые props и ключи, вырезанные как похожие на ПДн.
 */
export function sanitizeProps(props: Record<string, unknown> = {}): { props: Record<string, string | number | boolean | null>; piiKeys: string[] } {
  const clean: Record<string, string | number | boolean | null> = {};
  const piiKeys: string[] = [];
  for (const [key, value] of Object.entries(props).slice(0, MAX_PROPS)) {
    if (key.length > MAX_KEY_LENGTH) continue;
    if (typeof value === "string") {
      const pii = PII_PATTERNS.find(([, pattern]) => pattern.test(value));
      if (pii) {
        piiKeys.push(`${key} (${pii[0]})`);
        continue;
      }
      clean[key] = value.slice(0, MAX_STRING_LENGTH);
    } else if (typeof value === "number" && Number.isFinite(value)) {
      clean[key] = value;
    } else if (typeof value === "boolean" || value === null) {
      clean[key] = value;
    }
    // вложенные объекты и массивы не храним: отчёты строятся по плоским свойствам
  }
  return { props: clean, piiKeys };
}

function warnPii(name: string, piiKeys: string[]) {
  if (piiKeys.length) logger.warn(`Событие ${name}: вырезаны свойства, похожие на ПДн: ${piiKeys.join(", ")}`);
}

export interface ClientEvent {
  name: string;
  props?: Record<string, unknown>;
  occurredAt: string;
  sessionId?: string;
  anonymousId?: string;
  platform: (typeof CLIENT_PLATFORMS)[number];
  appVersion?: string;
}

/** Пишет события клиента. userId — только из проверенного токена, не из тела запроса. Возвращает число записанных. */
export async function recordClientEvents(events: ClientEvent[], userId: string | null): Promise<number> {
  const now = Date.now();
  const rows: InsertProductEvent[] = [];
  for (const event of events) {
    if (!isEventName(event.name)) continue;
    const { props, piiKeys } = sanitizeProps(event.props);
    warnPii(event.name, piiKeys);
    const occurredAt = new Date(event.occurredAt);
    rows.push({
      userId,
      anonymousId: event.anonymousId ?? null,
      sessionId: event.sessionId ?? null,
      name: event.name,
      props,
      platform: event.platform,
      appVersion: event.appVersion ?? null,
      // часы устройства могут спешить: событие из будущего записываем текущим временем
      occurredAt: occurredAt.getTime() > now + 5 * 60_000 ? new Date(now) : occurredAt,
    });
  }
  if (rows.length) await db.insert(productEvents).values(rows);
  return rows.length;
}

/**
 * Событие публичного сайта (E1.8-T7): без пользователя, anonymousId и сессии — сайт не ставит cookie и ничего о
 * посетителе не знает, IP не пишем. Ошибку записи только логирует, как track().
 */
export async function trackSite(name: "site_page_viewed" | "site_cta_clicked", props: Record<string, string>): Promise<void> {
  try {
    const { props: clean, piiKeys } = sanitizeProps(props);
    warnPii(name, piiKeys);
    await db.insert(productEvents).values({ name, props: clean, platform: "site", occurredAt: new Date() });
  } catch (error) {
    logger.error(`Не удалось записать событие ${name}:`, error);
  }
}

/** Серверное событие. Ошибку записи только логирует: запрос пользователя из-за аналитики не падает. */
export async function track(name: EventName, options: { userId?: string | null; props?: Record<string, unknown>; anonymousId?: string } = {}): Promise<void> {
  try {
    const { props, piiKeys } = sanitizeProps(options.props);
    warnPii(name, piiKeys);
    await db.insert(productEvents).values({
      userId: options.userId ?? null,
      anonymousId: options.anonymousId ?? null,
      name,
      props,
      platform: "server",
      occurredAt: new Date(),
    });
  } catch (error) {
    logger.error(`Не удалось записать событие ${name}:`, error);
  }
}

/** Удаляет события старше `days` дней (задача cleanup.events). */
export async function purgeOldEvents(days: number): Promise<number> {
  const before = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const result = await db.delete(productEvents).where(lt(productEvents.occurredAt, before));
  return result.rowCount ?? 0;
}
