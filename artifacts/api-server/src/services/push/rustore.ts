/**
 * RuStore Push (E2.2-T3): Android без сервисов Google и сборка rustore. API повторяет FCM HTTP v1:
 * POST vkpns.rustore.ru/v1/projects/{project_id}/messages:send с сервисным токеном проекта из RuStore Консоли
 * (RUSTORE_PUSH_PROJECT_ID, RUSTORE_PUSH_SERVICE_TOKEN). Доставку обеспечивает приложение RuStore на телефоне.
 */
import type { PushAdapter, PushMessage, PushResult } from "./types";

export interface RuStoreConfig {
  projectId: string;
  serviceToken: string;
}

export function ruStoreConfigFromEnv(env: NodeJS.ProcessEnv = process.env): RuStoreConfig | null {
  const projectId = env.RUSTORE_PUSH_PROJECT_ID?.trim();
  const serviceToken = env.RUSTORE_PUSH_SERVICE_TOKEN?.trim();
  return projectId && serviceToken ? { projectId, serviceToken } : null;
}

/** Нажатие открывает экран приложения: deepLink уведомления — путь сайта, в приложении те же пути (fintrack://budgets…). */
export const appDeepLink = (path: string) => `fintrack:/${path.startsWith("/") ? path : `/${path}`}`;

export function createRuStoreAdapter(config: RuStoreConfig, fetchImpl: typeof fetch = fetch): PushAdapter {
  const url = `https://vkpns.rustore.ru/v1/projects/${encodeURIComponent(config.projectId)}/messages:send`;

  async function post(message: object): Promise<PushResult> {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.serviceToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      return { status: "retry", error: `сеть: ${error instanceof Error ? error.message : String(error)}` };
    }
    const text = await response.text();
    if (response.ok) {
      let messageId: string | undefined;
      try {
        messageId = (JSON.parse(text) as { name?: string }).name;
      } catch {
        // тело ответа об успехе не документировано — id сообщения необязателен
      }
      return { status: "sent", providerMessageId: messageId };
    }
    const error = `${response.status} ${text.slice(0, 200)}`;
    // NOT_FOUND — токена нет в системе: приложение удалено или токен перевыпущен
    if (response.status === 404 || text.includes("NOT_FOUND") || text.includes("UNREGISTERED")) return { status: "invalid_token", error };
    if (response.status === 429 || response.status >= 500) return { status: "retry", error };
    // 401/403 — неверный сервисный токен, 400 — запрос: повтор не поможет
    return { status: "failed", error };
  }

  return {
    provider: "rustore",
    send: (token, message: PushMessage) => post({
      token,
      // без title SDK уведомление не показывает
      notification: { title: message.title, body: message.body },
      data: message.data,
      // канал «default» создаёт приложение; click_action_type 1 — click_action это deep link (RuStore 1.39+)
      android: { notification: { channel_id: "default", click_action: appDeepLink(message.data.deepLink), click_action_type: 1 } },
    }),
    // без notification SDK ничего не показывает и передаёт данные приложению
    sendSilent: (token, data) => post({ token, data }),
  };
}
