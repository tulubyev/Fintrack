import { Router } from "express";
import { z } from "zod";
import { NOTIFICATION_PREF_TYPES } from "@shared/schema";
import { authenticateToken } from "../../middleware/auth";
import { sendValidationError } from "../../lib/apiError";
import { getPrefs, updatePrefs } from "../../services/notificationPrefs";
import { handle } from "./common";

/** Настройки уведомлений (E2.2-T1): GET/PUT /api/v1/notification-prefs — группы × каналы, тихие часы, «скрывать суммы». */
export const notificationPrefsRouter = Router();

notificationPrefsRouter.use(authenticateToken);

const hour = z.number().int().min(0).max(23);
const updateSchema = z.object({
  groups: z.array(z.object({
    type: z.enum(NOTIFICATION_PREF_TYPES),
    push: z.boolean().optional(),
    email: z.boolean().optional(),
  }).strict()).max(NOTIFICATION_PREF_TYPES.length).optional(),
  // начало и конец совпадают — тихих часов нет
  quietHours: z.object({ start: hour, end: hour }).strict().optional(),
  hidePushAmounts: z.boolean().optional(),
}).strict();

notificationPrefsRouter.get("/", handle(async (req, res) => {
  res.json(await getPrefs(req.user.id));
}));

notificationPrefsRouter.put("/", handle(async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  res.json(await updatePrefs(req.user.id, parsed.data));
}));
