/**
 * Запросы к API v1. Токен доступа — из localStorage; 401 продлевает сессию перехватчик fetch
 * (lib/sessionRefresh). Ошибка v1 приходит как { error: { code, message, details } }.
 */
export class ApiRequestError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

type Query = Record<string, string | number | boolean | string[] | null | undefined>;

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

export async function api<T>(path: string, init: { method?: string; body?: unknown; query?: Query } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = localStorage.getItem('accessToken');
  if (token) headers.Authorization = `Bearer ${token}`;
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(withQuery(path, init.query), {
    method: init.method ?? 'GET',
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (response.status === 204) return undefined as T;

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = data?.error;
    throw new ApiRequestError(
      response.status,
      error?.code ?? 'HTTP_ERROR',
      error?.message ?? data?.message ?? 'Не удалось выполнить запрос',
      error?.details,
    );
  }
  return data as T;
}

/** Текст для тоста или формы: сообщение сервера, а при сбое сети — понятная фраза. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) return error.message;
  if (error instanceof TypeError) return 'Нет соединения с сервером';
  return 'Что-то пошло не так';
}
