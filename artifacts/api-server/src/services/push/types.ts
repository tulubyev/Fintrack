/** Общие типы отправки push (E2.2-T2): сообщение и ответ адаптера провайдера. */
import type { PushProvider } from "../pushTokens";

export interface PushMessage {
  title: string;
  body: string;
  /** Только идентификаторы и путь — без сумм и имён: payload виден системе телефона */
  data: { notificationId: string; type: string; deepLink: string };
}

export type PushResult =
  | { status: "sent"; providerMessageId?: string }
  /** Токен больше не действует (приложение удалено, подписка отозвана) — снимаем его с устройства */
  | { status: "invalid_token"; error: string }
  /** Временная ошибка (5xx, 429, сеть) — можно повторить */
  | { status: "retry"; error: string }
  /** Постоянная ошибка запроса — повтор не поможет */
  | { status: "failed"; error: string };

export interface PushAdapter {
  provider: PushProvider;
  send(token: string, message: PushMessage): Promise<PushResult>;
}
