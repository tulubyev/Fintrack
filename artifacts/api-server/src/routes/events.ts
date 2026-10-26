import { Router, type Response } from "express";
import { z } from "zod";
import { createRateLimit } from "../middleware";
import { optionalAuth } from "../middleware/auth";
import type { OptionalAuthRequest } from "../middleware/types";
import { CLIENT_PLATFORMS, recordClientEvents, trackSite } from "../services/analytics";
import { logger } from "../services/logger";

/**
 * POST /api/v1/events — продуктовые события клиента (E1.0-T3, решение D10).
 * Вход необязателен: до входа события идут с anonymousId. userId берётся только из токена.
 *
 * Публичный сайт (E1.8-T7) работает без JavaScript и без cookie, поэтому у него два своих входа:
 * - GET /site.gif?p=<путь> — пиксель на каждой странице → site_page_viewed;
 * - POST /site-cta?cta=<код> — атрибут ping у ссылок с data-cta (браузер шлёт его сам, путь — в Ping-From) → site_cta_clicked.
 * Боты по User-Agent не считаются; неверные параметры молча отбрасываются — страница из-за аналитики не ломается.
 */
const router = Router();

const eventsLimiter = createRateLimit({
  windowMs: 60_000,
  max: Number(process.env.RATE_LIMIT_EVENTS_MAX) || 60,
  message: "Слишком много событий, попробуйте позже",
});

const eventSchema = z.object({
  name: z.string().min(1).max(64),
  props: z.record(z.unknown()).optional(),
  occurredAt: z.string().datetime({ offset: true }),
  sessionId: z.string().max(64).optional(),
  anonymousId: z.string().max(64).optional(),
  platform: z.enum(CLIENT_PLATFORMS),
  appVersion: z.string().max(20).optional(),
});

const bodySchema = z.object({
  events: z.array(eventSchema).min(1).max(50),
});

router.post("/", eventsLimiter, optionalAuth, async (req: OptionalAuthRequest, res: Response) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "Некорректная пачка событий", details: parsed.error.flatten() },
    });
  }
  try {
    const accepted = await recordClientEvents(parsed.data.events, req.user?.id ?? null);
    res.status(202).json({ accepted });
  } catch (error) {
    logger.error("Не удалось записать события:", error);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Не удалось записать события" } });
  }
});

// 1×1 прозрачный GIF
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
const BOT_RE = /bot|crawl|spider|slurp|preview|headless|lighthouse|monitor|curl|wget|python|httpclient|java\//i;
const SITE_PATH_RE = /^\/[a-z0-9\-/]{0,100}$/i;
const CTA_RE = /^[a-z0-9-]{1,40}$/;

const isBot = (req: OptionalAuthRequest) => BOT_RE.test(req.get("user-agent") ?? "") || !req.get("user-agent");

/** Путь страницы сайта или null, если он нам не подходит (параметр пикселя — только путь, не адрес). */
const sitePath = (value: unknown): string | null => (typeof value === "string" && SITE_PATH_RE.test(value) ? value : null);

/** Путь страницы из абсолютного адреса в заголовке (Ping-From, Referer). */
function pathFromUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return sitePath(new URL(value).pathname);
  } catch {
    return null;
  }
}

router.get("/site.gif", eventsLimiter, async (req: OptionalAuthRequest, res: Response) => {
  const path = sitePath(req.query.p);
  if (path && !isBot(req)) await trackSite("site_page_viewed", { path });
  res.set({ "Content-Type": "image/gif", "Cache-Control": "no-store, max-age=0" }).send(PIXEL);
});

router.post("/site-cta", eventsLimiter, async (req: OptionalAuthRequest, res: Response) => {
  const cta = typeof req.query.cta === "string" && CTA_RE.test(req.query.cta) ? req.query.cta : null;
  const path = pathFromUrl(req.get("ping-from") ?? req.get("referer"));
  if (cta && !isBot(req)) await trackSite("site_cta_clicked", path ? { cta, path } : { cta });
  res.status(204).end();
});

export default router;
