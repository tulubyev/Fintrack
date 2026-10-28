/**
 * Регистрация push на устройстве (E2.2-T3). Провайдер выбирается по варианту сборки и наличию сервисов Google:
 * - play — только FCM (сборка Google Play);
 * - rustore — RuStore Push, если он доступен (установлен RuStore и вход в него), иначе FCM;
 * - apk (с сайта) — FCM, если есть сервисы Google, иначе RuStore Push.
 * Токен уходит на сервер в текущую сессию (PUT /api/v1/devices/current/push) при каждой разблокировке и при смене токена.
 * FCM и iOS (APNs) — следующим шагом (T4, E3.1): пока для них ничего не регистрируется.
 */

export type PushProviderName = "fcm" | "rustore";

export interface PushEnvironment {
  flavor: string;
  hasGooglePlayServices: boolean;
  ruStoreAvailable: boolean;
}

export function choosePushProvider({ flavor, hasGooglePlayServices, ruStoreAvailable }: PushEnvironment): PushProviderName | null {
  const fcm = hasGooglePlayServices ? "fcm" : null;
  const rustore = ruStoreAvailable ? "rustore" : null;
  if (flavor === "play") return fcm;
  if (flavor === "rustore") return rustore ?? fcm;
  return fcm ?? rustore;
}

/** Нативная часть (modules/fintrack-push); null — iOS, Expo Go или сборка без модуля. */
export interface PushNative {
  hasGooglePlayServices(): boolean;
  ruStoreAvailable(): Promise<boolean>;
  ruStoreToken(): Promise<string | null>;
}

export type PushRequest = (path: string, init: { method: string; body: unknown }) => Promise<unknown>;

/** Регистрирует токен устройства; возвращает провайдера, которому он отправлен, или null. */
export async function registerPush(native: PushNative | null, flavor: string, request: PushRequest): Promise<PushProviderName | null> {
  if (!native) return null;
  const provider = choosePushProvider({
    flavor,
    hasGooglePlayServices: native.hasGooglePlayServices(),
    ruStoreAvailable: await native.ruStoreAvailable(),
  });
  if (provider !== "rustore") return null; // FCM — T4
  const token = await native.ruStoreToken();
  if (!token) return null;
  await sendToken(request, "rustore", token);
  return "rustore";
}

export const sendToken = (request: PushRequest, provider: PushProviderName, token: string) =>
  request("/api/v1/devices/current/push", { method: "PUT", body: { provider, token } });
