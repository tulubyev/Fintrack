import { Router } from "express";
import { z } from "zod";
import { authenticateToken } from "../../middleware/auth";
import { sendValidationError } from "../../lib/apiError";
import { listNotifications, markAllRead, markRead } from "../../services/notificationService";
import { handle, pathId } from "./common";

/** Уведомления пользователя (E1.0-T4): GET /api/v1/notifications, /:id/read, /read-all. */
export const notificationsRouter = Router();

const listSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().max(200).optional(),
  unreadOnly: z.enum(["true", "false"]).optional().transform((value) => value === "true"),
});

notificationsRouter.use(authenticateToken);

notificationsRouter.get("/", handle(async (req, res) => {
  const parsed = listSchema.safeParse(req.query);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  res.json(await listNotifications(req.user.id, parsed.data));
}));

notificationsRouter.post("/read-all", handle(async (req, res) => {
  await markAllRead(req.user.id);
  res.status(204).end();
}));

notificationsRouter.post("/:id/read", handle(async (req, res) => {
  await markRead(req.user.id, pathId(req, "Уведомление не найдено"));
  res.status(204).end();
}));
