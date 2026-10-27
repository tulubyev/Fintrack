import { Router } from "express";
import { z } from "zod";
import { authenticateToken } from "../../middleware/auth";
import { sendValidationError } from "../../lib/apiError";
import { clearPushToken, PUSH_PROVIDERS, setPushToken } from "../../services/pushTokens";
import { handle } from "./common";

/** Устройство текущей сессии (E2.2-T1): PUT/DELETE /api/v1/devices/current/push — push-токен FCM, RuStore, APNs или подписка Web Push. */
export const devicesRouter = Router();

devicesRouter.use(authenticateToken);

const pushSchema = z.object({
  provider: z.enum(PUSH_PROVIDERS),
  // у Web Push токен — JSON подписки (endpoint и ключи), у остальных — строка провайдера
  token: z.string().trim().min(1).max(4096),
}).strict();

devicesRouter.put("/current/push", handle(async (req, res) => {
  const parsed = pushSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  await setPushToken(req.user.id, req.sessionId, parsed.data.provider, parsed.data.token);
  res.status(204).end();
}));

devicesRouter.delete("/current/push", handle(async (req, res) => {
  await clearPushToken(req.user.id, req.sessionId);
  res.status(204).end();
}));
