import { Router } from "express";
import { z } from "zod";
import { authenticateToken } from "../../middleware/auth";
import { ApiError, sendValidationError } from "../../lib/apiError";
import { enqueue, jobsBoss } from "../../jobs";
import { logger } from "../../services/logger";
import { createManualSeries, getSeries, listSeries, SERIES_KINDS, SERIES_STATUSES, updateSeries, upcoming } from "../../services/recurring/recurringApi";
import { detectForUser } from "../../services/recurring/recurringService";
import { handle, pathId, queryList } from "./common";

/** Регулярные платежи (E1.6-T3): /api/v1/recurring, /upcoming, /detect, /:id. */
export const recurringRouter = Router();

const patchSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  kind: z.enum(SERIES_KINDS),
  categoryId: z.string().uuid().nullable(),
  remindDaysBefore: z.number().int().min(0).max(7),
  status: z.enum(["confirmed", "ignored", "cancelled"]),
}).partial().strict().refine((patch) => Object.keys(patch).length > 0, "Нечего менять");

const manualSchema = z.object({
  transactionIds: z.array(z.string().uuid()).min(2).max(100),
  displayName: z.string().trim().min(1).max(120).optional(),
  kind: z.enum(SERIES_KINDS).optional(),
}).strict();

// ручной перезапуск детектора — не чаще раза в 10 минут на пользователя (одна копия API на сервере)
const DETECT_COOLDOWN_MS = 10 * 60_000;
const lastDetect = new Map<string, number>();

const seriesId = (req: Parameters<typeof pathId>[0]) => pathId(req, "Регулярный платёж не найден");

recurringRouter.use(authenticateToken);

recurringRouter.get("/", handle(async (req, res) => {
  const kind = queryList(req.query.kind);
  const status = queryList(req.query.status);
  const direction = req.query.direction;
  if (kind?.some((value) => !(SERIES_KINDS as readonly string[]).includes(value))) throw new ApiError(400, "VALIDATION_ERROR", "Неизвестный вид платежа");
  if (status?.some((value) => !(SERIES_STATUSES as readonly string[]).includes(value))) throw new ApiError(400, "VALIDATION_ERROR", "Неизвестный статус");
  if (direction !== undefined && direction !== "in" && direction !== "out") throw new ApiError(400, "VALIDATION_ERROR", "direction — in или out");
  res.json(await listSeries(req.user.id, { kind, status, direction }));
}));

recurringRouter.get("/upcoming", handle(async (req, res) => {
  const days = req.query.days === undefined ? 14 : Number(req.query.days);
  if (!Number.isInteger(days) || days < 1 || days > 90) throw new ApiError(400, "VALIDATION_ERROR", "days — от 1 до 90");
  res.json(await upcoming(req.user.id, days));
}));

recurringRouter.post("/detect", handle(async (req, res) => {
  const userId = req.user.id;
  const last = lastDetect.get(userId);
  if (last && Date.now() - last < DETECT_COOLDOWN_MS) {
    throw new ApiError(429, "RATE_LIMITED", "Поиск регулярных платежей уже запускался — повторите через несколько минут");
  }
  lastDetect.set(userId, Date.now());
  if (jobsBoss()) {
    await enqueue("recurring.detect", { userId }, { singletonKey: userId });
  } else {
    // без очереди (тесты, локальный запуск без воркера) — сразу
    await detectForUser(userId).catch((error) => logger.warn("recurring.detect:", error));
  }
  res.status(202).json({ queued: true });
}));

recurringRouter.post("/", handle(async (req, res) => {
  const parsed = manualSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  res.status(201).json(await createManualSeries(req.user.id, parsed.data));
}));

recurringRouter.get("/:id", handle(async (req, res) => {
  res.json(await getSeries(req.user.id, seriesId(req)));
}));

recurringRouter.patch("/:id", handle(async (req, res) => {
  const id = seriesId(req);
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  res.json(await updateSeries(req.user.id, id, parsed.data));
}));
