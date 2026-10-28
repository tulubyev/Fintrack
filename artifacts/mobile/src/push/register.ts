/**
 * Регистрация push на устройстве (E2.2-T3, T4). Провайдеры по порядку предпочтения — по варианту сборки и наличию
 * сервисов Google:
 * - iOS — APNs;
 * - play — только FCM (сборка Google Play);
 * - rustore — RuStore Push (установлен RuStore и вход в него), затем FCM;
 * - apk (с сайта) — FCM, затем RuStore Push.
 * Берётся первый провайдер, выдавший токен: без google-services.json Firebase не запускается и FCM токена не даст.
 * Токен уходит на сервер в текущую сессию (PUT /api/v1/devices/current/push) при каждой разблокировке и при смене токена.
 */

export type PushProviderName = "fcm" | "rustore" | "apns";

export interface PushEnvironment {
  platform: string;
  flavor: string;
  hasGooglePlayServices: boolean;
  ruStoreAvailable: boolean;
}

export function pushProviders({ platform, flavor, hasGooglePlayServices, ruStoreAvailable }: PushEnvironment): PushProviderName[] {
  if (platform === "ios") return ["apns"];
  if (platform !== "android") return [];
  const fcm: PushProviderName[] = hasGooglePlayServices ? ["fcm"] : [];
  const rustore: PushProviderName[] = ruStoreAvailable ? ["rustore"] : [];
  if (flavor === "play") return fcm;
  if (flavor === "rustore") return [...rustore, ...fcm];
  return [...fcm, ...rustore];
}

export type PushRequest = (path: string, init: { method: string; body: unknown }) => Promise<unknown>;

export interface PushDeps {
  platform: string;
  flavor: string;
  hasGooglePlayServices(): boolean;
  ruStoreAvailable(): Promise<boolean>;
  ruStoreToken(): Promise<string | null>;
  /** Токен FCM (Android) или APNs (iOS) через expo-notifications; null — Firebase не настроен или нет разрешения (iOS). */
  deviceToken(): Promise<string | null>;
  request: PushRequest;
}

/** Регистрирует токен устройства; возвращает провайдера, которому он отправлен, или null. */
export async function registerPush(deps: PushDeps): Promise<PushProviderName | null> {
  const providers = pushProviders({
    platform: deps.platform,
    flavor: deps.flavor,
    hasGooglePlayServices: deps.hasGooglePlayServices(),
    ruStoreAvailable: await deps.ruStoreAvailable(),
  });
  for (const provider of providers) {
    const token = provider === "rustore" ? await deps.ruStoreToken() : await deps.deviceToken();
    if (!token) continue;
    await sendToken(deps.request, provider, token);
    return provider;
  }
  return null;
}

export const sendToken = (request: PushRequest, provider: PushProviderName, token: string) =>
  request("/api/v1/devices/current/push", { method: "PUT", body: { provider, token } });
