import { ApiRequestError, type RequestOptions } from "@workspace/shared/api";
import type { LocalStore, OutboxItem, SyncPageData } from "./store";

/**
 * Синхронизация (E2.1-T5): забрать изменения с сервера → отправить очередь → забрать ещё раз, если что-то ушло.
 * Сначала забираем, чтобы правку, сделанную без сети, сравнить со свежей серверной версией (конфликт),
 * а не затереть ею чужое изменение.
 *
 * Сервер — GET /api/v1/sync (курсор по номеру транзакции, T4). Отправка — обычные эндпоинты v1 с клиентским id:
 * повтор после потерянного ответа сервер узнаёт и не создаёт дубль.
 */

export type SyncPhase = "idle" | "syncing" | "offline" | "error";

export interface SyncState {
  phase: SyncPhase;
  /** Когда последний раз всё забрали с сервера, мс. */
  lastSyncAt: number | null;
  /** Ждут отправки. */
  pending: number;
  /** Из них ждут повтора после ошибки сервера. */
  retrying: number;
  conflicts: number;
  failed: number;
  error: string | null;
}

export type Request = <T>(path: string, init?: RequestOptions) => Promise<T>;

export interface SyncDeps {
  store: LocalStore;
  request: Request;
  now?: () => number;
  pageLimit?: number;
}

interface SyncResponse extends SyncPageData {
  hasMore: boolean;
}

const CURSOR_KEY = "sync.cursor";
const LAST_SYNC_KEY = "sync.lastAt";

/** fetch без ответа сервера: нет сети, обрыв, таймаут (отмена запроса). */
const isNetworkError = (error: unknown) => error instanceof TypeError || (error instanceof Error && error.name === "AbortError");

/** Временная ошибка сервера — повторим с растущей паузой, правку не трогаем. */
const isTransient = (error: ApiRequestError) => error.status === 408 || error.status === 429 || error.status >= 500;

export class SyncEngine {
  private state: SyncState = { phase: "idle", lastSyncAt: null, pending: 0, retrying: 0, conflicts: 0, failed: 0, error: null };
  private listeners = new Set<() => void>();
  private running: Promise<void> | null = null;
  private again = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private readonly now: () => number;

  constructor(private readonly deps: SyncDeps) {
    this.now = deps.now ?? Date.now;
    deps.store.subscribe((kind) => {
      void this.refreshCounts();
      // Правка на устройстве — отправить, как только соберётся пачка
      if (kind === "local") this.schedule(500);
    });
  }

  getState = (): SyncState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private update(patch: Partial<SyncState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  async init(): Promise<void> {
    this.stopped = false;
    const last = await this.deps.store.getKv(LAST_SYNC_KEY);
    this.update({ lastSyncAt: last ? Number(last) : null });
    await this.refreshCounts();
  }

  /** Выход: остановить таймер и не начинать новых раундов, пока не вызовут init. */
  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  async refreshCounts(): Promise<void> {
    this.update(await this.deps.store.outboxSummary());
  }

  schedule(delayMs = 0): void {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.sync();
    }, delayMs);
  }

  /**
   * Один раунд за раз; вызов во время раунда — ещё один раунд следом.
   * now — пользователь сам попросил (обновление жестом) или появилась сеть: паузы после ошибок сбрасываются.
   */
  async sync(options: { now?: boolean } = {}): Promise<void> {
    if (this.stopped) return;
    if (options.now) await this.deps.store.resetBackoff();
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = (async () => {
      do {
        this.again = false;
        await this.round();
      } while (this.again && !this.stopped);
    })().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async round(): Promise<void> {
    this.update({ phase: "syncing", error: null });
    try {
      await this.pull();
      const pushed = await this.push();
      if (pushed) await this.pull();
      const now = this.now();
      await this.deps.store.setKv(LAST_SYNC_KEY, String(now));
      this.update({ phase: "idle", lastSyncAt: now });
    } catch (error) {
      const offline = isNetworkError(error);
      this.update({ phase: offline ? "offline" : "error", error: offline ? null : (error as Error).message });
    } finally {
      await this.refreshCounts();
      await this.scheduleRetry();
    }
  }

  /** Правка ждёт паузы после ошибки сервера — разбудить синхронизацию, когда пауза пройдёт. */
  private async scheduleRetry(): Promise<void> {
    if (this.state.phase !== "idle" || !this.state.pending) return;
    const at = await this.deps.store.nextRetryAt();
    if (at !== null) this.schedule(Math.max(0, at - this.now()));
  }

  private async pull(): Promise<void> {
    const { store, request } = this.deps;
    for (;;) {
      const cursor = await store.getKv(CURSOR_KEY);
      let page: SyncResponse;
      try {
        page = await request<SyncResponse>("/api/v1/sync", { query: { cursor, limit: this.deps.pageLimit ?? 500 } });
      } catch (error) {
        if (error instanceof ApiRequestError && error.status === 410 && cursor) {
          // Устройство не синхронизировалось дольше срока жизни курсора — полный снимок заново
          await store.resetForResync();
          continue;
        }
        throw error;
      }
      await store.applyPage(page);
      if (!page.hasMore) return;
    }
  }

  /** Отправить очередь по порядку. Сбой сети или 5xx останавливает отправку до следующего раунда. */
  private async push(): Promise<number> {
    const { store, request } = this.deps;
    let sent = 0;
    for (let item = await store.takeNext(); item; item = await store.takeNext()) {
      try {
        await request(item.path, { method: item.method, body: item.body ?? undefined });
        await store.complete(item);
        sent++;
      } catch (error) {
        if (await this.handlePushError(item, error)) return sent;
        sent++;
      } finally {
        store.release(item); // на случай сбоя самой базы: иначе очередь встала бы до перезапуска
      }
    }
    return sent;
  }

  /** true — остановить отправку (повторим позже). */
  private async handlePushError(item: OutboxItem, error: unknown): Promise<boolean> {
    const { store } = this.deps;
    if (error instanceof ApiRequestError && error.status === 401) {
      // Сессия не обновилась (сеть) или закончилась — правка остаётся в очереди
      throw error;
    }
    if (!(error instanceof ApiRequestError)) {
      // Ответа нет (сеть) — повторим при появлении сети или возврате в приложение, без растущей паузы
      throw error;
    }
    if (isTransient(error)) {
      await store.defer(item, error.message);
      return true;
    }
    const apiError = error as ApiRequestError;
    if (item.kind === "delete" && apiError.status === 404) {
      await store.complete(item); // уже удалено
    } else if (item.kind === "create" && apiError.status === 409 && apiError.code === "DUPLICATE_RESOURCE") {
      await store.markDuplicate(item);
    } else {
      await store.fail(item, apiError.message);
    }
    return false;
  }
}

/** Текст плашки над экраном; null — показывать нечего. */
export function describeSync(state: SyncState): { text: string; tone: "muted" | "danger"; actionable: boolean } | null {
  const queue = state.pending ? ` · ${state.pending} в очереди` : "";
  if (state.conflicts || state.failed) {
    const parts = [
      state.conflicts ? `изменено на другом устройстве: ${state.conflicts}` : null,
      state.failed ? `не удалось сохранить: ${state.failed}` : null,
    ].filter(Boolean);
    return { text: `Нужно ваше решение — ${parts.join(", ")}`, tone: "danger", actionable: true };
  }
  if (state.phase === "offline") {
    return { text: state.pending ? `Нет сети · изменения отправятся позже${queue}` : "Нет сети · показаны сохранённые данные", tone: "muted", actionable: false };
  }
  if (state.phase === "error") return { text: `Не удалось синхронизироваться${state.error ? `: ${state.error}` : ""}${queue}`, tone: "danger", actionable: false };
  if (state.phase === "idle" && state.retrying) return { text: `Сервер недоступен · изменения отправятся позже${queue}`, tone: "muted", actionable: false };
  return null;
}
