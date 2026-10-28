/**
 * FCM HTTP v1 (E2.2-T2): Android с сервисами Google. Ключ — сервисный аккаунт Firebase в FCM_SERVICE_ACCOUNT
 * (JSON целиком или в base64). OAuth-токен получаем сами: JWT RS256 → oauth2.googleapis.com, кешируем на час.
 */
import { createSign } from "node:crypto";
import type { PushAdapter, PushMessage, PushResult } from "./types";

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
}

export function parseServiceAccount(raw: string | undefined): ServiceAccount | null {
  const value = raw?.trim();
  if (!value) return null;
  const json = value.startsWith("{") ? value : Buffer.from(value, "base64").toString("utf8");
  const parsed = JSON.parse(json) as ServiceAccount;
  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) throw new Error("FCM_SERVICE_ACCOUNT: нет project_id, client_email или private_key");
  return parsed;
}

const base64url = (input: string | Buffer) => Buffer.from(input).toString("base64url");

export function createFcmAdapter(account: ServiceAccount, fetchImpl: typeof fetch = fetch): PushAdapter {
  const tokenUri = account.token_uri ?? "https://oauth2.googleapis.com/token";
  let cached: { token: string; expiresAt: number } | null = null;

  async function accessToken(): Promise<string> {
    if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
    const now = Math.floor(Date.now() / 1000);
    const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const claims = base64url(JSON.stringify({
      iss: account.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: tokenUri,
      iat: now,
      exp: now + 3600,
    }));
    const signature = createSign("RSA-SHA256").update(`${header}.${claims}`).sign(account.private_key);
    const response = await fetchImpl(tokenUri, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${header}.${claims}.${base64url(signature)}` }),
    });
    if (!response.ok) throw new Error(`FCM: токен доступа не выдан (${response.status})`);
    const body = await response.json() as { access_token: string; expires_in: number };
    cached = { token: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
    return cached.token;
  }

  return {
    provider: "fcm",
    async send(token: string, message: PushMessage): Promise<PushResult> {
      let auth: string;
      try {
        auth = await accessToken();
      } catch (error) {
        return { status: "retry", error: String(error instanceof Error ? error.message : error) };
      }
      let response: Response;
      try {
        response = await fetchImpl(`https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`, {
          method: "POST",
          headers: { Authorization: `Bearer ${auth}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            message: {
              token,
              notification: { title: message.title, body: message.body },
              data: message.data,
              android: { priority: "high", notification: { channel_id: "default" } },
            },
          }),
          signal: AbortSignal.timeout(10_000),
        });
      } catch (error) {
        return { status: "retry", error: `сеть: ${error instanceof Error ? error.message : String(error)}` };
      }
      if (response.ok) return { status: "sent", providerMessageId: ((await response.json()) as { name?: string }).name };
      const text = await response.text();
      // UNREGISTERED — приложение удалено или токен сменился; INVALID_ARGUMENT про токен — тоже мёртвый токен
      if (response.status === 404 || text.includes("UNREGISTERED") || (response.status === 400 && text.includes("registration token"))) {
        return { status: "invalid_token", error: `${response.status} ${text.slice(0, 200)}` };
      }
      if (response.status === 401) cached = null; // токен доступа отозван — следующий запрос получит новый
      if (response.status === 401 || response.status === 429 || response.status >= 500) return { status: "retry", error: `${response.status} ${text.slice(0, 200)}` };
      return { status: "failed", error: `${response.status} ${text.slice(0, 200)}` };
    },
  };
}
