import { Router } from "express";
import { z } from "zod";
import { authenticateToken } from "../../middleware/auth";
import { sendValidationError } from "../../lib/apiError";
import { listNotifications, markAllRead, markRead } from "../../services/notificationService";
import { emailSettings, setEmailNotifications, verifyUnsubscribeToken } from "../../services/notificationEmailService";
import { handle, pathId } from "./common";

/** Уведомления пользователя (E1.0-T4): GET /api/v1/notifications, /:id/read, /read-all, /settings (письма, D19). */
export const notificationsRouter = Router();

/** «Отписаться» из письма без входа: /api/v1/email/unsubscribe?token=… (подпись HMAC от id пользователя). */
export const emailRouter = Router();

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

const settingsSchema = z.object({ email: z.boolean() }).strict();

notificationsRouter.get("/settings", handle(async (req, res) => {
  res.json(await emailSettings(req.user.id));
}));

notificationsRouter.patch("/settings", handle(async (req, res) => {
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  await setEmailNotifications(req.user.id, parsed.data.email);
  res.json(await emailSettings(req.user.id));
}));

notificationsRouter.post("/read-all", handle(async (req, res) => {
  await markAllRead(req.user.id);
  res.status(204).end();
}));

notificationsRouter.post("/:id/read", handle(async (req, res) => {
  await markRead(req.user.id, pathId(req, "Уведомление не найдено"));
  res.status(204).end();
}));

const page = (title: string, text: string) => `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="font-family:Segoe UI,Arial,sans-serif;background:#f5f7fa;margin:0;padding:24px"><div style="max-width:480px;margin:40px auto;background:#fff;border-radius:12px;padding:28px">
<p style="margin:0 0 4px;color:#0080ff;font-weight:600">FinTrack</p><h1 style="font-size:20px;margin:0 0 12px">${title}</h1><p style="line-height:1.5;margin:0">${text}</p></div></body></html>`;

emailRouter.get("/unsubscribe", handle(async (req, res) => {
  const userId = typeof req.query.token === "string" ? verifyUnsubscribeToken(req.query.token) : null;
  if (!userId) {
    res.status(400).type("html").send(page("Ссылка не подошла", "Отключить письма можно в FinTrack: «Настройки» → «Уведомления»."));
    return;
  }
  await setEmailNotifications(userId, false);
  res.type("html").send(page("Письма отключены", "Уведомления по-прежнему будут в колокольчике приложения. Включить письма снова можно в «Настройках»."));
}));
