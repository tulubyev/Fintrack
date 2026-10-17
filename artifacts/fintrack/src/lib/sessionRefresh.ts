/**
 * Тихое продление сессии.
 *
 * Access-токен живёт 15 минут. Когда запрос к API с этим токеном получает 401,
 * токен обновляется через /api/auth/refresh (refresh-токен лежит в HttpOnly-cookie),
 * а запрос повторяется один раз. Одновременные запросы ждут одного обновления.
 * Если обновить не удалось, сессия закончилась: приложение получает событие
 * SESSION_EXPIRED_EVENT и показывает форму входа.
 */

export const SESSION_EXPIRED_EVENT = 'fintrack:session-expired';

// Эндпоинты входа и самого обновления не повторяются: их 401 — окончательный ответ
const NO_RETRY_PATHS = ['/api/auth/login', '/api/auth/register', '/api/auth/refresh', '/api/auth/logout', '/api/auth/password/'];

const originalFetch: typeof window.fetch = window.fetch.bind(window);
let refreshing: Promise<string | null> | null = null;

export function refreshAccessToken(): Promise<string | null> {
  if (!refreshing) {
    refreshing = (async () => {
      // Вторая попытка: другая вкладка могла только что обновить cookie
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const response = await originalFetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin' });
          if (response.ok) {
            const data = await response.json();
            localStorage.setItem('accessToken', data.accessToken);
            return data.accessToken as string;
          }
        } catch {
          // сеть недоступна — повторим один раз
        }
        if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 500));
      }
      return null;
    })().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

function apiPath(input: RequestInfo | URL): string | null {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const url = new URL(raw, window.location.origin);
  if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/')) return null;
  return url.pathname;
}

export function installSessionRefresh() {
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const retryRequest = input instanceof Request ? input.clone() : null;
    const response = await originalFetch(input, init);
    if (response.status !== 401) return response;

    const path = apiPath(input);
    if (!path || NO_RETRY_PATHS.some((prefix) => path.startsWith(prefix))) return response;

    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    if (!headers.get('Authorization')?.startsWith('Bearer ')) return response;

    const token = await refreshAccessToken();
    if (!token) {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('currentUser');
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
      return response;
    }

    headers.set('Authorization', `Bearer ${token}`);
    if (retryRequest) return originalFetch(new Request(retryRequest, { headers }));
    return originalFetch(input, { ...init, headers });
  };
}

/** Завершает сессию на сервере (refresh-cookie отправится сама) и чистит локальные данные. */
export async function logoutSession() {
  try {
    await originalFetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  } catch {
    // выход локально всё равно выполняется
  }
  localStorage.removeItem('accessToken');
  localStorage.removeItem('currentUser');
}
