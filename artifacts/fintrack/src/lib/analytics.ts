/**
 * Продуктовые события веба (E1.0-T3, решение D10): пачками в POST /api/v1/events, только на наш сервер.
 *
 * - anonymousId живёт в localStorage и связывает события до входа с пользователем (передаётся при входе).
 * - Сессия заканчивается после 30 минут неактивности; app_opened отправляется в начале каждой сессии.
 * - Ошибки отправки не ретраятся и никогда не мешают интерфейсу: аналитика — не бизнес-данные.
 * - В props не кладём ПДн (телефон, e-mail, номера карт): сервер их всё равно вырежет.
 */
type EventName = "app_opened" | "notification_shown" | "notification_clicked" | "recurring_cancel_guide_opened" | "dashboard_viewed" | "dashboard_block_clicked" | "onboarding_started" | "onboarding_step_completed" | "uncategorized_review_opened" | "import_instructions_opened";
type Props = Record<string, string | number | boolean | null>;

interface QueuedEvent {
  name: EventName;
  props: Props;
  occurredAt: string;
  sessionId: string;
  anonymousId: string;
  platform: "web" | "pwa";
}

const ANONYMOUS_KEY = "ft_anonymous_id";
const SESSION_KEY = "ft_session";
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const FLUSH_DELAY_MS = 5_000;
const MAX_BATCH = 50;

let queue: QueuedEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | undefined;
let memoryAnonymousId: string | undefined; // если localStorage недоступен (приватный режим)

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

function storageGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function storageSet(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* приватный режим: живём без сохранения */ }
}

export function getAnonymousId(): string {
  const stored = storageGet(ANONYMOUS_KEY) ?? memoryAnonymousId;
  if (stored) return stored;
  memoryAnonymousId = newId();
  storageSet(ANONYMOUS_KEY, memoryAnonymousId);
  return memoryAnonymousId;
}

// Продлевает текущую сессию или начинает новую; isNew — сессия только что началась
function touchSession(): { id: string; isNew: boolean } {
  const now = Date.now();
  let session: { id: string; lastActivity: number } | null = null;
  try { session = JSON.parse(storageGet(SESSION_KEY) ?? "null"); } catch { session = null; }
  const isNew = !session || now - session.lastActivity > SESSION_TIMEOUT_MS;
  const id = isNew ? newId() : session!.id;
  storageSet(SESSION_KEY, JSON.stringify({ id, lastActivity: now }));
  return { id, isNew };
}

const platform = (): "web" | "pwa" =>
  typeof window !== "undefined" && window.matchMedia?.("(display-mode: standalone)").matches ? "pwa" : "web";

function flush() {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = undefined; }
  while (queue.length) {
    const events = queue.splice(0, MAX_BATCH);
    const token = storageGet("accessToken");
    fetch("/api/v1/events", {
      method: "POST",
      keepalive: true, // долетит и при закрытии вкладки
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ events }),
    }).catch(() => { /* сеть недоступна — событие теряем, интерфейс не трогаем */ });
  }
}

function enqueue(name: EventName, props: Props, sessionId: string) {
  queue.push({ name, props, occurredAt: new Date().toISOString(), sessionId, anonymousId: getAnonymousId(), platform: platform() });
  if (queue.length >= MAX_BATCH) flush();
  else if (!flushTimer) flushTimer = setTimeout(flush, FLUSH_DELAY_MS);
}

function entry(): string {
  if (platform() === "pwa") return "pwa";
  try {
    if (document.referrer && new URL(document.referrer).host !== location.host) return "link";
  } catch { /* битый referrer — считаем прямым заходом */ }
  return "direct";
}

// Возвращает id текущей сессии; если она только началась — сначала app_opened
function startSessionIfNeeded(): string {
  const session = touchSession();
  if (session.isNew) enqueue("app_opened", { entry: entry(), route: location.pathname }, session.id);
  return session.id;
}

export function track(name: EventName, props: Props = {}) {
  enqueue(name, props, startSessionIfNeeded());
}

/** Вызывается один раз при старте приложения. */
export function initAnalytics() {
  startSessionIfNeeded();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
    else startSessionIfNeeded(); // вернулись после 30 минут — новая сессия
  });
}
