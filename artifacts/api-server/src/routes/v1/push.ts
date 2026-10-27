import { Router } from "express";
import { vapidPublicKey } from "../../services/push/pushService";
import { handle } from "./common";

/** Публичный ключ VAPID для подписки браузера на Web Push (E2.2-T2): GET /api/v1/push/vapid-public-key, без входа. */
export const pushRouter = Router();

pushRouter.get("/vapid-public-key", handle(async (_req, res) => {
  res.set("Cache-Control", "public, max-age=3600").json({ publicKey: vapidPublicKey() });
}));
