import { Router } from "express";
import { z } from "zod";
import { authenticateToken } from "../../middleware/auth";
import { sendValidationError } from "../../lib/apiError";
import { SYNC_DEFAULT_LIMIT, SYNC_MAX_LIMIT, syncPage } from "../../services/syncService";
import { handle } from "./common";

/** Синхронизация приложения по курсору (E2.1-T4): /api/v1/sync. */
export const syncRouter = Router();
syncRouter.use(authenticateToken);

const querySchema = z.object({
  cursor: z.string().max(1000).optional(),
  limit: z.coerce.number().int().min(1).max(SYNC_MAX_LIMIT).default(SYNC_DEFAULT_LIMIT),
});

syncRouter.get("/", handle(async (req, res) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  res.json(await syncPage(req.user.id, parsed.data.cursor, parsed.data.limit));
}));
