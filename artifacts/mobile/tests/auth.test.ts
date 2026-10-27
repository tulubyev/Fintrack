import { describe, expect, it, vi } from "vitest";
import { createApiClient } from "@workspace/shared/api";
import { AuthController, LOCK_AFTER_MS, MAX_PIN_ATTEMPTS, type SecureKeyValue } from "../src/auth/controller";
import { hashPin, isValidPin, verifyPin } from "../src/auth/pin";

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const storage: SecureKeyValue & { data: Map<string, string> } = {
    data,
    get: async (key) => data.get(key) ?? null,
    set: async (key, value) => {
      if (value === null) data.delete(key);
      else data.set(key, value);
    },
  };
  return storage;
}

/** Сервер входа: пароль «secret», 2FA-код «123456» для логина «2fa@example.test». */
function fakeServer() {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input).replace("https://api.test", "");
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    calls.push(url);
    if (url === "/api/auth/login") {
      if (body.password !== "secret") return json(400, { message: "Неверный логин или пароль" });
      if (body.identifier === "2fa@example.test" && !body.twoFactorCode) return json(206, { requiresTwoFactor: true });
      return json(200, { user: { id: "u1", firstName: "Анна", lastName: "Петрова", phone: "+7900" }, accessToken: "a1", refreshToken: "r1" });
    }
    if (url === "/api/auth/logout") return json(200, { message: "ok" });
    if (url === "/api/v1/me" && init?.method === "DELETE") {
      return body.password === "secret" ? new Response(null, { status: 204 }) : json(403, { error: { code: "WRONG_PASSWORD", message: "Неверный пароль" } });
    }
    if (url === "/api/auth/refresh") return json(401, { message: "Сессия недействительна" });
    return json(init?.headers && new Headers(init.headers).get("Authorization") === "Bearer a1" ? 200 : 401, {});
  });
  return { fetch: fetchMock as unknown as typeof fetch, calls };
}

// Быстрый «хеш» для тестов контроллера; настоящий scrypt проверяется отдельно
const fastPin = { hash: async (pin: string) => `h:${pin}`, verify: async (pin: string, stored: string) => stored === `h:${pin}` };

function setup(opts: { storage?: ReturnType<typeof memoryStorage>; biometrics?: boolean; allowed?: boolean } = {}) {
  const storage = opts.storage ?? memoryStorage();
  const server = fakeServer();
  let now = 1_000_000;
  const biometrics = { available: vi.fn(async () => opts.biometrics ?? false), authenticate: vi.fn(async () => opts.biometrics ?? false) };
  // Разрешение сервера (D20): по умолчанию в тестах как на проде — выключено
  const serverPolicy = { allowed: opts.allowed ?? false };
  const policy = { cached: vi.fn(async () => serverPolicy.allowed), refresh: vi.fn(async () => serverPolicy.allowed) };
  const auth = new AuthController({
    storage,
    biometrics,
    policy,
    pin: fastPin,
    now: () => now,
    createClient: (session, onSessionExpired) =>
      createApiClient({ baseUrl: "https://api.test", session, onSessionExpired, fetch: server.fetch, retryDelayMs: 1 }),
  });
  return { auth, storage, server, biometrics, serverPolicy, advance: (ms: number) => (now += ms) };
}

describe("вход", () => {
  it("пароль → задать PIN → готово; refresh-токен в хранилище, access-токен — нет", async () => {
    const { auth, storage } = setup();
    await auth.init();
    expect(auth.getState().status).toBe("signedOut");

    expect(await auth.login(" anna@example.test ", "secret")).toBe("ok");
    expect(auth.getState()).toMatchObject({ status: "pinSetup", user: { firstName: "Анна" } });
    expect(storage.data.get("session.refreshToken")).toBe("r1");
    expect([...storage.data.values()].join()).not.toContain("a1");

    await auth.setPin("2468");
    expect(auth.getState().status).toBe("ready");
    expect(storage.data.get("pin.hash")).toBe("h:2468");
  });

  it("2FA: первый ответ просит код, с кодом — вход", async () => {
    const { auth } = setup();
    await auth.init();
    expect(await auth.login("2fa@example.test", "secret")).toBe("twoFactor");
    expect(auth.getState().status).toBe("signedOut");
    expect(await auth.login("2fa@example.test", "secret", "123456")).toBe("ok");
  });

  it("неверный пароль — ошибка сервера, в хранилище ничего", async () => {
    const { auth, storage } = setup();
    await auth.init();
    await expect(auth.login("anna@example.test", "wrong")).rejects.toMatchObject({ message: "Неверный логин или пароль" });
    expect(storage.data.size).toBe(0);
  });
});

describe("холодный старт", () => {
  it("с сессией и PIN — блокировка; PIN открывает; без PIN — задать PIN", async () => {
    const withPin = setup({ storage: memoryStorage({ "session.refreshToken": "r1", "pin.hash": "h:2468", "session.user": '{"id":"u1","firstName":"Анна","lastName":null}' }) });
    await withPin.auth.init();
    expect(withPin.auth.getState()).toMatchObject({ status: "locked", user: { firstName: "Анна" } });
    expect(await withPin.auth.unlockWithPin("2468")).toBe(true);
    expect(withPin.auth.getState().status).toBe("ready");

    const noPin = setup({ storage: memoryStorage({ "session.refreshToken": "r1" }) });
    await noPin.auth.init();
    expect(noPin.auth.getState().status).toBe("pinSetup");
  });
});

describe("PIN и биометрия", () => {
  it(`${MAX_PIN_ATTEMPTS} неверных PIN подряд — вход сброшен, сессия завершена на сервере`, async () => {
    const { auth, storage, server } = setup({ storage: memoryStorage({ "session.refreshToken": "r1", "pin.hash": "h:2468" }) });
    await auth.init();
    for (let i = 1; i < MAX_PIN_ATTEMPTS; i++) {
      expect(await auth.unlockWithPin("0000")).toBe(false);
      expect(auth.getState()).toMatchObject({ status: "locked", attemptsLeft: MAX_PIN_ATTEMPTS - i });
    }
    expect(await auth.unlockWithPin("0000")).toBe(false);
    expect(auth.getState().status).toBe("signedOut");
    expect(auth.getState().notice).toContain("Слишком много");
    expect(storage.data.size).toBe(0);
    expect(server.calls).toContain("/api/auth/logout");
  });

  it("счётчик ошибок переживает перезапуск и сбрасывается верным PIN", async () => {
    const storage = memoryStorage({ "session.refreshToken": "r1", "pin.hash": "h:2468" });
    const first = setup({ storage });
    await first.auth.init();
    await first.auth.unlockWithPin("1111");
    await first.auth.unlockWithPin("1111");

    const restarted = setup({ storage });
    await restarted.auth.init();
    expect(restarted.auth.getState().attemptsLeft).toBe(MAX_PIN_ATTEMPTS - 2);
    await restarted.auth.unlockWithPin("2468");
    expect(restarted.auth.getState().attemptsLeft).toBe(MAX_PIN_ATTEMPTS);
    expect(storage.data.has("pin.failedAttempts")).toBe(false);
  });

  it("биометрия включается только после успешной проверки и открывает блокировку", async () => {
    const off = setup({ biometrics: false, allowed: true });
    await off.auth.init();
    await off.auth.login("anna@example.test", "secret");
    await off.auth.setPin("2468");
    expect(await off.auth.setBiometrics(true)).toBe(false);
    expect(off.auth.getState().biometricsEnabled).toBe(false);

    const on = setup({ biometrics: true, allowed: true, storage: memoryStorage({ "session.refreshToken": "r1", "pin.hash": "h:2468" }) });
    await on.auth.init();
    expect(await on.auth.unlockWithBiometrics()).toBe(false); // не включена
    expect(await on.auth.setBiometrics(true)).toBe(true);
    expect(await on.auth.unlockWithBiometrics()).toBe(true);
    expect(on.auth.getState().status).toBe("ready");
  });

  it("D20: сервер не разрешил — биометрию не предложить, не включить и не открыть ею блокировку", async () => {
    const { auth } = setup({ biometrics: true, allowed: false, storage: memoryStorage({ "session.refreshToken": "r1", "pin.hash": "h:2468" }) });
    await auth.init();
    expect(auth.getState().biometricsAllowed).toBe(false);
    expect(await auth.biometricsAvailable()).toBe(false);
    expect(await auth.setBiometrics(true)).toBe(false);
    expect(await auth.unlockWithBiometrics()).toBe(false);
    expect(auth.getState().status).toBe("locked");
  });

  it("D20: включённую биометрию отключает и запрет при запуске, и запрет администратора при возврате в приложение", async () => {
    const storage = memoryStorage({ "session.refreshToken": "r1", "pin.hash": "h:2468", "pin.biometrics": "1" });
    const atStart = setup({ biometrics: true, allowed: false, storage });
    await atStart.auth.init();
    expect(atStart.auth.getState().biometricsEnabled).toBe(false);
    expect(storage.data.has("pin.biometrics")).toBe(false);

    const later = setup({ biometrics: true, allowed: true, storage: memoryStorage({ "session.refreshToken": "r1", "pin.hash": "h:2468", "pin.biometrics": "1" }) });
    await later.auth.init();
    await later.auth.unlockWithPin("2468");
    expect(later.auth.getState().biometricsEnabled).toBe(true);
    later.serverPolicy.allowed = false; // администратор выключил
    later.auth.onForeground();
    await vi.waitFor(() => expect(later.auth.getState().biometricsEnabled).toBe(false));
    expect(await later.auth.unlockWithBiometrics()).toBe(false);
  });
});

describe("автоблокировка", () => {
  it(`фон дольше ${LOCK_AFTER_MS / 60000} минут — блокировка, короче — нет`, async () => {
    const { auth, advance } = setup({ storage: memoryStorage({ "session.refreshToken": "r1", "pin.hash": "h:2468" }) });
    await auth.init();
    await auth.unlockWithPin("2468");

    auth.onBackground();
    advance(LOCK_AFTER_MS - 1000);
    auth.onForeground();
    expect(auth.getState().status).toBe("ready");

    auth.onBackground();
    advance(LOCK_AFTER_MS);
    auth.onForeground();
    expect(auth.getState().status).toBe("locked");
  });
});

describe("сессия", () => {
  it("выход стирает всё и завершает сессию на сервере, даже без сети", async () => {
    const { auth, storage, server } = setup();
    await auth.init();
    await auth.login("anna@example.test", "secret");
    await auth.setPin("2468");
    // сеть пропала
    (server.fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new TypeError("Network request failed"));
    await auth.logout();
    expect(auth.getState().status).toBe("signedOut");
    expect(storage.data.size).toBe(0);
  });

  it("сервер отклонил сессию — вход с сообщением, хранилище пусто", async () => {
    const { auth, storage } = setup({ storage: memoryStorage({ "session.refreshToken": "r-old", "pin.hash": "h:2468" }) });
    await auth.init();
    await auth.unlockWithPin("2468");
    // access-токена нет — клиент обновит сессию, сервер ответит 401
    await expect(auth.client.request("/api/v1/accounts")).rejects.toMatchObject({ status: 401 });
    expect(auth.getState()).toMatchObject({ status: "signedOut", notice: "Сессия завершена — войдите снова" });
    expect(storage.data.size).toBe(0);
  });
});

describe("хеш PIN (scrypt)", () => {
  it("проверка верного и неверного PIN, соль делает хеши разными", async () => {
    const stored = await hashPin("2468");
    expect(stored).toMatch(/^scrypt\$4096\$8\$1\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
    expect(stored).not.toContain("2468\u0000");
    expect(await verifyPin("2468", stored)).toBe(true);
    expect(await verifyPin("2469", stored)).toBe(false);
    expect(await hashPin("2468")).not.toBe(stored);
  });

  it("правила PIN: 4–6 цифр", () => {
    expect(isValidPin("1234")).toBe(true);
    expect(isValidPin("123456")).toBe(true);
    expect(isValidPin("123")).toBe(false);
    expect(isValidPin("1234567")).toBe(false);
    expect(isValidPin("12a4")).toBe(false);
  });
});

describe("удаление аккаунта", () => {
  it("неверный пароль — ошибка, вход на месте; верный — вход и локальные данные стёрты, событие logout", async () => {
    const { auth, storage } = setup();
    const events: unknown[] = [];
    auth.onSessionEvent((event) => {
      events.push(event);
    });
    await auth.init();
    await auth.login("anna@example.test", "secret");
    await auth.setPin("2468");
    await expect(auth.deleteAccount("wrong")).rejects.toThrow("Неверный пароль");
    expect(auth.getState().status).toBe("ready");

    await auth.deleteAccount("secret");
    expect(auth.getState()).toMatchObject({ status: "signedOut", user: null });
    expect(auth.getState().notice).toContain("удалён");
    expect(storage.data.size).toBe(0);
    expect(events.at(-1)).toEqual({ type: "signedOut", reason: "logout" });
  });
});

describe("события сессии для локальных данных", () => {
  it("вход — signedIn с id; выход — logout; сессия отклонена сервером — expired", async () => {
    const { auth } = setup();
    const events: unknown[] = [];
    auth.onSessionEvent((event) => {
      events.push(event);
    });
    await auth.init();
    await auth.login("anna@example.test", "secret");
    await auth.setPin("2468");
    await auth.logout();
    expect(events).toEqual([{ type: "signedIn", userId: "u1" }, { type: "signedOut", reason: "logout" }]);

    events.length = 0;
    await auth.login("anna@example.test", "secret");
    (auth as unknown as { accessToken: string }).accessToken = "expired"; // access-токен истёк
    await auth.client.request("/api/v1/accounts").catch(() => undefined); // 401 → refresh 401 → сессия завершена
    expect(events).toEqual([{ type: "signedIn", userId: "u1" }, { type: "signedOut", reason: "expired" }]);
  });
});
