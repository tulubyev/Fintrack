import { describe, expect, it } from "vitest";
import { choosePushProvider, registerPush, type PushNative } from "../src/push/register";

const env = (flavor: string, hasGooglePlayServices: boolean, ruStoreAvailable: boolean) => ({ flavor, hasGooglePlayServices, ruStoreAvailable });

describe("выбор push-провайдера", () => {
  it("play — только FCM", () => {
    expect(choosePushProvider(env("play", true, true))).toBe("fcm");
    expect(choosePushProvider(env("play", false, true))).toBeNull();
  });

  it("rustore — RuStore Push, без него — FCM", () => {
    expect(choosePushProvider(env("rustore", true, true))).toBe("rustore");
    expect(choosePushProvider(env("rustore", true, false))).toBe("fcm");
    expect(choosePushProvider(env("rustore", false, false))).toBeNull();
  });

  it("apk — FCM, без сервисов Google — RuStore Push", () => {
    expect(choosePushProvider(env("apk", true, true))).toBe("fcm");
    expect(choosePushProvider(env("apk", false, true))).toBe("rustore");
    expect(choosePushProvider(env("apk", false, false))).toBeNull();
  });
});

describe("регистрация токена", () => {
  const native = (gms: boolean, rustore: boolean, token: string | null = "ru-token"): PushNative => ({
    hasGooglePlayServices: () => gms,
    ruStoreAvailable: async () => rustore,
    ruStoreToken: async () => token,
  });
  const recorder = () => {
    const calls: { path: string; init: { method: string; body: unknown } }[] = [];
    return { calls, request: async (path: string, init: { method: string; body: unknown }) => void calls.push({ path, init }) };
  };

  it("RuStore: токен уходит в текущую сессию", async () => {
    const { calls, request } = recorder();
    expect(await registerPush(native(false, true), "rustore", request)).toBe("rustore");
    expect(calls).toEqual([{ path: "/api/v1/devices/current/push", init: { method: "PUT", body: { provider: "rustore", token: "ru-token" } } }]);
  });

  it("нет модуля (iOS, Expo Go), выбран FCM или токена нет — на сервер ничего", async () => {
    const { calls, request } = recorder();
    expect(await registerPush(null, "rustore", request)).toBeNull();
    expect(await registerPush(native(true, true), "apk", request)).toBeNull();
    expect(await registerPush(native(false, true, null), "rustore", request)).toBeNull();
    expect(calls).toHaveLength(0);
  });
});
