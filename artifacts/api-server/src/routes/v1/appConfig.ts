import { Router } from "express";
import { getBooleanSetting } from "../../services/appSettings";
import { handle } from "./common";

/**
 * Настройки для клиентов без входа: /api/v1/app-config. Без кеша — изменение администратора видно сразу.
 * Приложение читает его до предложения биометрии (D20).
 */
export const appConfigRouter = Router();

appConfigRouter.get("/", handle(async (_req, res) => {
  const biometrics = await getBooleanSetting("mobileBiometrics");
  res.set("Cache-Control", "no-store").json({ mobileBiometricsEnabled: biometrics.enabled });
}));
