/**
 * Ядро клиента API v1 для веба и приложения: запрос с access-токеном, разбор ошибок v1
 * и тихое обновление сессии. Ошибка v1 приходит как { error: { code, message, details } },
 * старые эндпоинты /api/auth/* — как { message }.
 */

export class ApiRequestError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

export type Query = Record<string, string | number | boolean | string[] | null | undefined>;

export function withQuery(path: string, query?: Query): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) value.forEach((item) => params.append(key, item));
    else params.set(key, String(value));
  }
  const search = params.toString();
  return search ? `${path}?${search}` : path;
}

/** Текст для тоста или формы: сообщение сервера, а при сбое сети — понятная фраза. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) return error.message;
  if (error instanceof TypeError) return 'Нет соединения с сервером';
  return 'Что-то пошло не так';
}

/** Ответ с ошибкой → ApiRequestError; тело может быть пустым или не JSON. */
export async function toApiError(response: Response): Promise<ApiRequestError> {
  const data = await response.json().catch(() => null);
  const error = data?.error;
  return new ApiRequestError(
    response.status,
    error?.code ?? 'HTTP_ERROR',
    error?.message ?? data?.message ?? 'Не удалось выполнить запрос',
    error?.details,
  );
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Query;
  /** Отмена запроса: TanStack Query передаёт свой signal, экран — таймаут. */
  signal?: AbortSignal;
}

// ---------------------------------------------------------------------------
// Клиент с refresh-токеном в теле запроса (приложение; веб держит его в HttpOnly-cookie)
// ---------------------------------------------------------------------------

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

/**
 * Где лежат токены. Access-токен — только в памяти, refresh-токен — в защищённом хранилище
 * устройства. save должен дописать новый refresh-токен до того, как клиент им воспользуется:
 * сервер меняет его при каждом обновлении, а повтор старого вне окна в 60 с отзывает сессию.
 */
export interface SessionStore {
  accessToken(): string | null;
  refreshToken(): Promise<string | null>;
  save(tokens: SessionTokens): Promise<void>;
  clear(): Promise<void>;
}

/**
 * accessToken — новый токен или null. sessionInvalid — сервер окончательно отклонил сессию (401);
 * при сбое сети или 503 сессия, возможно, жива, и токены не трогаем.
 */
export interface RefreshResult {
  accessToken: string | null;
  sessionInvalid: boolean;
}

export interface ApiClientOptions {
  /** Адрес сервера без /api: «https://fin-wall.ru». */
  baseUrl: string;
  session: SessionStore;
  /** Сервер отклонил сессию: токены уже стёрты, приложению пора показать вход. */
  onSessionExpired?: () => void;
  fetch?: typeof fetch;
  /** Пауза перед повтором обновления после сбоя сети, мс. */
  retryDelayMs?: number;
}

// Эндпоинты входа и самого обновления не повторяются: их 401 — окончательный ответ
const NO_RETRY_PATHS = ['/api/auth/login', '/api/auth/register', '/api/auth/refresh', '/api/auth/logout', '/api/auth/password/'];

export function createApiClient(options: ApiClientOptions) {
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const doFetch = options.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  const retryDelayMs = options.retryDelayMs ?? 500;
  const { session } = options;
  let refreshing: Promise<RefreshResult> | null = null;

  async function expire(): Promise<RefreshResult> {
    await session.clear();
    options.onSessionExpired?.();
    return { accessToken: null, sessionInvalid: true };
  }

  /** Одно обновление на всех: параллельные запросы ждут тот же промис. */
  function refresh(): Promise<RefreshResult> {
    if (!refreshing) {
      refreshing = (async (): Promise<RefreshResult> => {
        const refreshToken = await session.refreshToken();
        if (!refreshToken) return { accessToken: null, sessionInvalid: false };
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const response = await doFetch(`${baseUrl}/api/auth/refresh`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ refreshToken }),
              credentials: 'omit',
            });
            if (response.ok) {
              const tokens = (await response.json()) as SessionTokens;
              await session.save(tokens);
              return { accessToken: tokens.accessToken, sessionInvalid: false };
            }
            if (response.status === 401) return expire();
          } catch {
            // сеть недоступна — повторим один раз
          }
          if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        }
        return { accessToken: null, sessionInvalid: false };
      })().finally(() => {
        refreshing = null;
      });
    }
    return refreshing;
  }

  function send(path: string, init: RequestOptions, token: string | null): Promise<Response> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (init.body !== undefined) headers['Content-Type'] = 'application/json';
    return doFetch(`${baseUrl}${withQuery(path, init.query)}`, {
      method: init.method ?? 'GET',
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      credentials: 'omit',
      signal: init.signal,
    });
  }

  async function request<T>(path: string, init: RequestOptions = {}): Promise<T> {
    const retryable = !NO_RETRY_PATHS.some((prefix) => path.startsWith(prefix));
    let token = session.accessToken();
    // Холодный старт: access-токена в памяти нет, но сессия сохранена — сначала обновляем
    if (!token && retryable && (await session.refreshToken())) {
      token = (await refresh()).accessToken;
    }

    let response = await send(path, init, token);
    if (response.status === 401 && retryable && token) {
      const next = await refresh();
      if (next.accessToken) response = await send(path, init, next.accessToken);
    }

    if (!response.ok) throw await toApiError(response);
    if (response.status === 204) return undefined as T;
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  return { request, refresh };
}

export type ApiClient = ReturnType<typeof createApiClient>;
