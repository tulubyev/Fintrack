import { describe, expect, it } from "vitest";
import { isSyncPush, pushPath, REMIND_AGAIN_MS, shouldOfferReminders } from "../src/push/notifications";
import { pushProviders, registerPush, type PushDeps } from "../src/push/register";

const android = (flavor: string, hasGooglePlayServices: boolean, ruStoreAvailable: boolean) =>
  ({ platform: "android", flavor, hasGooglePlayServices, ruStoreAvailable });

describe("провайдеры push по порядку", () => {
  it("play — только FCM", () => {
    expect(pushProviders(android("play", true, true))).toEqual(["fcm"]);
    expect(pushProviders(android("play", false, true))).toEqual([]);
  });

  it("rustore — RuStore Push, затем FCM", () => {
    expect(pushProviders(android("rustore", true, true))).toEqual(["rustore", "fcm"]);
    expect(pushProviders(android("rustore", true, false))).toEqual(["fcm"]);
    expect(pushProviders(android("rustore", false, false))).toEqual([]);
  });

  it("apk — FCM, затем RuStore Push", () => {
    expect(pushProviders(android("apk", true, true))).toEqual(["fcm", "rustore"]);
    expect(pushProviders(android("apk", false, true))).toEqual(["rustore"]);
  });

  it("iOS — APNs", () => {
    expect(pushProviders({ platform: "ios", flavor: "apk", hasGooglePlayServices: false, ruStoreAvailable: false })).toEqual(["apns"]);
  });
});

describe("регистрация токена", () => {
  const setup = (overrides: Partial<PushDeps> = {}) => {
    const calls: { path: string; init: { method: string; body: unknown } }[] = [];
    const deps: PushDeps = {
      platform: "android",
      flavor: "apk",
      hasGooglePlayServices: () => true,
      ruStoreAvailable: async () => true,
      ruStoreToken: async () => "ru-token",
      deviceToken: async () => "fcm-token",
      request: async (path, init) => void calls.push({ path, init }),
      ...overrides,
    };
    return { calls, deps };
  };
  const put = (provider: string, token: string) => ({ path: "/api/v1/devices/current/push", init: { method: "PUT", body: { provider, token } } });

  it("первый провайдер с токеном уходит в текущую сессию", async () => {
    const { calls, deps } = setup();
    expect(await registerPush(deps)).toBe("fcm");
    expect(calls).toEqual([put("fcm", "fcm-token")]);
  });

  it("FCM не настроен (нет google-services.json) — берём RuStore", async () => {
    const { calls, deps } = setup({ deviceToken: async () => null });
    expect(await registerPush(deps)).toBe("rustore");
    expect(calls).toEqual([put("rustore", "ru-token")]);
  });

  it("сборка rustore — сначала RuStore; iOS — APNs", async () => {
    const rustore = setup({ flavor: "rustore" });
    expect(await registerPush(rustore.deps)).toBe("rustore");
    const ios = setup({ platform: "ios", deviceToken: async () => "apns-token" });
    expect(await registerPush(ios.deps)).toBe("apns");
    expect(ios.calls).toEqual([put("apns", "apns-token")]);
  });

  it("ни одного токена — на сервер ничего", async () => {
    const { calls, deps } = setup({ deviceToken: async () => null, ruStoreToken: async () => null });
    expect(await registerPush(deps)).toBeNull();
    expect(calls).toHaveLength(0);
  });
});

describe("пришедший push", () => {
  it("нажатие открывает экран из deepLink; тихий push и чужие ссылки — нет", () => {
    expect(pushPath({ notificationId: "n1", type: "budget_threshold", deepLink: "/budgets?month=2026-10" })).toBe("/budgets?month=2026-10");
    expect(pushPath({ deepLink: "/app/goals" })).toBe("/goals");
    expect(pushPath({ deepLink: "https://evil.example/x" })).toBeNull();
    expect(pushPath({ type: "sync" })).toBeNull();
    expect(pushPath(undefined)).toBeNull();
    expect(isSyncPush({ type: "sync" })).toBe(true);
    expect(isSyncPush({ type: "budget_threshold" })).toBe(false);
  });

  it("предложение включить уведомления: не разрешены и можно спросить; «Не сейчас» — через две недели", () => {
    const now = Date.now();
    const base = { status: "undetermined" as const, canAskAgain: true, dismissedAt: null, now };
    expect(shouldOfferReminders(base)).toBe(true);
    expect(shouldOfferReminders({ ...base, status: "granted" })).toBe(false);
    expect(shouldOfferReminders({ ...base, status: "denied", canAskAgain: false })).toBe(false);
    expect(shouldOfferReminders({ ...base, dismissedAt: now - 1000 })).toBe(false);
    expect(shouldOfferReminders({ ...base, dismissedAt: now - REMIND_AGAIN_MS })).toBe(true);
  });
});
