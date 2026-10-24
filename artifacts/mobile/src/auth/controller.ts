import type { ApiClient, SessionStore, SessionTokens } from "@workspace/shared/api";

/**
 * Вход в приложение (E2.1-T3) без привязки к React Native — его состояния покрыты тестами.
 *
 * signedOut → (пароль, 2FA) → pinSetup → ready ⇄ locked
 * - refresh-токен — в защищённом хранилище, access-токен — только в памяти;
 * - PIN 4–6 цифр хранится хешем; биометрия открывает тот же вход, но только если её разрешил сервер (D20:
 *   по умолчанию выключена, включает .env или администратор) — выключение отключает её и у тех, кто включил;
 * - 5 неверных PIN подряд — токены стёрты, нужен полный вход;
 * - уход в фон дольше LOCK_AFTER_MS и холодный старт — блокировка.
 */

export const MAX_PIN_ATTEMPTS = 5;
export const LOCK_AFTER_MS = 5 * 60 * 1000;

export type AuthStatus = "loading" | "signedOut" | "pinSetup" | "locked" | "ready";

export interface AuthUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
}

export interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  biometricsEnabled: boolean;
  /** Сервер разрешает вход по биометрии (D20). */
  biometricsAllowed: boolean;
  /** Сколько попыток PIN осталось до сброса входа. */
  attemptsLeft: number;
  /** Сообщение для экрана входа: почему сессия закончилась. */
  notice: string | null;
}

/** Защищённое хранилище строк (SecureStore на устройстве, Map в тестах). */
export interface SecureKeyValue {
  get(key: string): Promise<string | null>;
  set(key: string, value: string | null): Promise<void>;
}

export interface Biometrics {
  available(): Promise<boolean>;
  authenticate(): Promise<boolean>;
}

/** Разрешение сервера на биометрию: cached — последнее известное (офлайн), refresh — спросить сервер. */
export interface BiometricsPolicy {
  cached(): Promise<boolean>;
  refresh(): Promise<boolean>;
}

export interface PinHasher {
  hash(pin: string): Promise<string>;
  verify(pin: string, stored: string): Promise<boolean>;
}

export interface AuthDeps {
  storage: SecureKeyValue;
  biometrics: Biometrics;
  policy: BiometricsPolicy;
  pin: PinHasher;
  createClient(session: SessionStore, onSessionExpired: () => void): ApiClient;
  now?: () => number;
}

const KEYS = {
  refreshToken: "session.refreshToken",
  user: "session.user",
  pin: "pin.hash",
  attempts: "pin.failedAttempts",
  biometrics: "pin.biometrics",
} as const;

interface LoginResponse {
  requiresTwoFactor?: boolean;
  accessToken?: string;
  refreshToken?: string;
  user?: AuthUser;
}

export type LoginResult = "ok" | "twoFactor";

/**
 * Для локальных данных приложения: signedIn — вошёл пользователь (другой — стереть чужие данные);
 * signedOut: logout — явный выход или 5 неверных PIN (стереть всё), expired — сессия закончилась сама
 * (неотправленное сохраняется до входа того же пользователя).
 */
export type SessionEvent = { type: "signedIn"; userId: string | null } | { type: "signedOut"; reason: "logout" | "expired" };

export class AuthController {
  readonly client: ApiClient;
  private state: AuthState = {
    status: "loading", user: null, biometricsEnabled: false, biometricsAllowed: false, attemptsLeft: MAX_PIN_ATTEMPTS, notice: null,
  };
  private listeners = new Set<() => void>();
  private sessionListeners = new Set<(event: SessionEvent) => void | Promise<void>>();
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private backgroundedAt: number | null = null;
  private readonly now: () => number;

  constructor(private readonly deps: AuthDeps) {
    this.now = deps.now ?? Date.now;
    const session: SessionStore = {
      accessToken: () => this.accessToken,
      refreshToken: async () => this.refreshToken,
      save: (tokens) => this.saveTokens(tokens),
      clear: () => this.wipe("expired"),
    };
    this.client = deps.createClient(session, () => this.update({ status: "signedOut", notice: "Сессия завершена — войдите снова" }));
  }

  getState = (): AuthState => this.state;

  onSessionEvent(listener: (event: SessionEvent) => void | Promise<void>): () => void {
    this.sessionListeners.add(listener);
    return () => this.sessionListeners.delete(listener);
  }

  private async emitSession(event: SessionEvent): Promise<void> {
    await Promise.all([...this.sessionListeners].map((listener) => listener(event)));
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Холодный старт: есть сессия — блокировка (или задать PIN, если не успели), нет — вход. */
  async init(): Promise<void> {
    const { storage } = this.deps;
    this.refreshToken = await storage.get(KEYS.refreshToken);
    if (!this.refreshToken) return this.update({ status: "signedOut" });
    const [user, pin, attempts, biometrics] = await Promise.all([
      storage.get(KEYS.user),
      storage.get(KEYS.pin),
      storage.get(KEYS.attempts),
      storage.get(KEYS.biometrics),
    ]);
    // Разрешение применяется до показа блокировки: запрещённая биометрия не должна успеть запуститься
    await this.applyPolicy(await this.deps.policy.cached(), biometrics === "1");
    this.update({
      status: pin ? "locked" : "pinSetup",
      user: user ? (JSON.parse(user) as AuthUser) : null,
      attemptsLeft: MAX_PIN_ATTEMPTS - Number(attempts ?? 0),
    });
    void this.refreshPolicy();
  }

  /** Спросить сервер, разрешена ли биометрия; без сети остаётся последнее известное решение. */
  async refreshPolicy(): Promise<void> {
    await this.applyPolicy(await this.deps.policy.refresh(), this.state.biometricsEnabled);
  }

  private async applyPolicy(allowed: boolean, enabled: boolean): Promise<void> {
    if (!allowed && enabled) await this.deps.storage.set(KEYS.biometrics, null);
    this.update({ biometricsAllowed: allowed, biometricsEnabled: allowed && enabled });
  }

  async login(identifier: string, password: string, twoFactorCode?: string): Promise<LoginResult> {
    const response = await this.client.request<LoginResponse>("/api/auth/login", {
      method: "POST",
      body: { identifier: identifier.trim(), password, ...(twoFactorCode ? { twoFactorCode } : {}) },
    });
    if (response.requiresTwoFactor) return "twoFactor";
    if (!response.accessToken || !response.refreshToken) throw new Error("Сервер не выдал сессию");
    await this.saveTokens({ accessToken: response.accessToken, refreshToken: response.refreshToken });
    const user: AuthUser | null = response.user
      ? { id: response.user.id, firstName: response.user.firstName ?? null, lastName: response.user.lastName ?? null }
      : null;
    await this.deps.storage.set(KEYS.user, user ? JSON.stringify(user) : null);
    await this.deps.storage.set(KEYS.attempts, null);
    await this.emitSession({ type: "signedIn", userId: user?.id ?? null });
    this.update({ status: "pinSetup", user, notice: null, attemptsLeft: MAX_PIN_ATTEMPTS });
    await this.refreshPolicy();
    return "ok";
  }

  async setPin(pin: string): Promise<void> {
    await this.deps.storage.set(KEYS.pin, await this.deps.pin.hash(pin));
    this.backgroundedAt = null;
    this.update({ status: "ready" });
  }

  /** Включение спрашивает отпечаток сразу — чтобы не включить то, что не сработает. */
  async setBiometrics(enabled: boolean): Promise<boolean> {
    if (enabled && (!this.state.biometricsAllowed || !(await this.deps.biometrics.authenticate()))) return false;
    await this.deps.storage.set(KEYS.biometrics, enabled ? "1" : null);
    this.update({ biometricsEnabled: enabled });
    return true;
  }

  async biometricsAvailable(): Promise<boolean> {
    return this.state.biometricsAllowed && (await this.deps.biometrics.available());
  }

  /** true — разблокировано; false — неверный PIN (после пятого вход сброшен). */
  async unlockWithPin(pin: string): Promise<boolean> {
    const stored = await this.deps.storage.get(KEYS.pin);
    if (stored && (await this.deps.pin.verify(pin, stored))) {
      await this.deps.storage.set(KEYS.attempts, null);
      this.update({ status: "ready", attemptsLeft: MAX_PIN_ATTEMPTS });
      return true;
    }
    const failed = Number((await this.deps.storage.get(KEYS.attempts)) ?? 0) + 1;
    if (failed >= MAX_PIN_ATTEMPTS) {
      await this.logout();
      this.update({ notice: "Слишком много неверных PIN-кодов — войдите с паролем" });
      return false;
    }
    await this.deps.storage.set(KEYS.attempts, String(failed));
    this.update({ attemptsLeft: MAX_PIN_ATTEMPTS - failed });
    return false;
  }

  async unlockWithBiometrics(): Promise<boolean> {
    if (!this.state.biometricsAllowed || !this.state.biometricsEnabled || !(await this.deps.biometrics.authenticate())) return false;
    await this.deps.storage.set(KEYS.attempts, null);
    this.update({ status: "ready", attemptsLeft: MAX_PIN_ATTEMPTS });
    return true;
  }

  onBackground(): void {
    if (this.state.status === "ready") this.backgroundedAt = this.now();
  }

  onForeground(): void {
    if (this.state.status === "ready" && this.backgroundedAt !== null && this.now() - this.backgroundedAt >= LOCK_AFTER_MS) {
      this.update({ status: "locked" });
    }
    this.backgroundedAt = null;
    if (this.state.status !== "signedOut") void this.refreshPolicy();
  }

  /** Выход: сессия завершается на сервере (если есть сеть), данные входа стираются в любом случае. */
  async logout(): Promise<void> {
    const refreshToken = this.refreshToken;
    if (refreshToken) {
      await this.client.request("/api/auth/logout", { method: "POST", body: { refreshToken } }).catch(() => undefined);
    }
    await this.wipe("logout");
    this.update({ status: "signedOut", notice: null });
  }

  private async saveTokens(tokens: SessionTokens): Promise<void> {
    // Сначала хранилище: сервер уже заменил старый токен, потерять новый нельзя
    await this.deps.storage.set(KEYS.refreshToken, tokens.refreshToken);
    this.refreshToken = tokens.refreshToken;
    this.accessToken = tokens.accessToken;
  }

  private async wipe(reason: "logout" | "expired"): Promise<void> {
    this.accessToken = null;
    this.refreshToken = null;
    this.backgroundedAt = null;
    await Promise.all(Object.values(KEYS).map((key) => this.deps.storage.set(key, null)));
    this.update({ user: null, biometricsEnabled: false, attemptsLeft: MAX_PIN_ATTEMPTS });
    await this.emitSession({ type: "signedOut", reason });
  }

  private update(patch: Partial<AuthState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }
}
