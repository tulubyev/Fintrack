import { Router, type Response } from "express";
import { z } from "zod";
import { createRateLimit } from "../middleware";
import { optionalAuth } from "../middleware/auth";
import type { OptionalAuthRequest } from "../middleware/types";
import { CLIENT_PLATFORMS, recordClientEvents } from "../services/analytics";
import { logger } from "../services/logger";

/**
 * POST /api/v1/events — продуктовые события клиента (E1.0-T3, решение D10).
 * Вход необязателен: до входа события идут с anonymousId. userId берётся только из токена.
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

export default router;
