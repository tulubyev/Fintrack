/**
 * Запросы к API v1. Токен доступа — из localStorage; 401 продлевает сессию перехватчик fetch
 * (lib/sessionRefresh). Разбор ошибок и параметров — общий с приложением (@workspace/shared/api).
 */
import { toApiError, withQuery, type Query } from '@workspace/shared/api';

export { ApiRequestError, errorMessage, withQuery } from '@workspace/shared/api';

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

  if (!response.ok) throw await toApiError(response);
  return (await response.json().catch(() => null)) as T;
}
