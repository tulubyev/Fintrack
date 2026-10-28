/**
 * Web Push с VAPID (E2.2-T2): установленный PWA и браузеры. Ключи — VAPID_PUBLIC_KEY и VAPID_PRIVATE_KEY
 * (сгенерировать: npx web-push generate-vapid-keys), VAPID_SUBJECT — mailto: для связи с владельцем.
 * Токен устройства — JSON подписки браузера (endpoint и ключи p256dh, auth).
 */
import webpush from "web-push";
import type { PushAdapter, PushMessage, PushResult } from "./types";

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export function vapidKeysFromEnv(env: NodeJS.ProcessEnv = process.env): VapidKeys | null {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject: env.VAPID_SUBJECT?.trim() || "mailto:privacy@fin-wall.ru" };
}

type Send = typeof webpush.sendNotification;

export function createWebPushAdapter(keys: VapidKeys, send: Send = webpush.sendNotification): PushAdapter {
  return {
    provider: "webpush",
    async send(token: string, message: PushMessage): Promise<PushResult> {
      let subscription: webpush.PushSubscription;
      try {
        subscription = JSON.parse(token);
      } catch {
        return { status: "invalid_token", error: "подписка — не JSON" };
      }
      try {
        const result = await send(subscription, JSON.stringify({ title: message.title, body: message.body, ...message.data }), {
          vapidDetails: { subject: keys.subject, publicKey: keys.publicKey, privateKey: keys.privateKey },
          TTL: 24 * 60 * 60,
          timeout: 10_000,
        });
        return { status: "sent", providerMessageId: result.headers?.location };
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        const text = `${statusCode ?? "сеть"} ${(error as Error).message ?? ""}`.slice(0, 200);
        // 404/410 — подписка удалена в браузере
        if (statusCode === 404 || statusCode === 410) return { status: "invalid_token", error: text };
        if (statusCode === undefined || statusCode === 429 || statusCode >= 500) return { status: "retry", error: text };
        return { status: "failed", error: text };
      }
    },
  };
}
