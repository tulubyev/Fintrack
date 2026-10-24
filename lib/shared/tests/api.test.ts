import { describe, expect, it, vi } from 'vitest';
import { ApiRequestError, createApiClient, errorMessage, withQuery, type SessionStore, type SessionTokens } from '../src/api';

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Хранилище в памяти: как SecureStore, но с журналом сохранений. */
function memorySession(initial: Partial<SessionTokens> = {}) {
  let access = initial.accessToken ?? null;
  let refresh = initial.refreshToken ?? null;
  const saved: SessionTokens[] = [];
  const store: SessionStore & { saved: SessionTokens[]; cleared: number } = {
    saved,
    cleared: 0,
    accessToken: () => access,
    refreshToken: async () => refresh,
    save: async (tokens) => {
      access = tokens.accessToken;
      refresh = tokens.refreshToken;
      saved.push(tokens);
    },
    clear: async () => {
      access = null;
      refresh = null;
      store.cleared++;
    },
  };
  return store;
}

/**
 * Фейковый сервер: /api/auth/refresh принимает только текущий refresh-токен и выдаёт новую пару,
 * остальные пути отвечают 200 с действующим access-токеном и 401 со старым.
 */
function fakeServer(opts: { refreshStatus?: number; refreshThrows?: number } = {}) {
  let generation = 1;
  let refreshThrows = opts.refreshThrows ?? 0;
  const calls: { url: string; auth: string | null; body: unknown }[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, auth: headers.get('Authorization'), body });
    if (url.endsWith('/api/auth/refresh')) {
      if (refreshThrows > 0) {
        refreshThrows--;
        throw new TypeError('Network request failed');
      }
      if (opts.refreshStatus) return json(opts.refreshStatus, { message: 'Сессия недействительна, войдите снова' });
      if (body?.refreshToken !== `refresh-${generation}`) return json(401, { message: 'Сессия недействительна, войдите снова' });
      generation++;
      return json(200, { accessToken: `access-${generation}`, refreshToken: `refresh-${generation}` });
    }
    if (headers.get('Authorization') !== `Bearer access-${generation}`) {
      return json(401, { error: { code: 'TOKEN_EXPIRED', message: 'Токен истёк' } });
    }
    if (url.includes('/empty')) return new Response(null, { status: 204 });
    if (url.includes('/missing')) return json(404, { error: { code: 'NOT_FOUND', message: 'Счёт не найден', details: { id: 'x' } } });
    return json(200, { ok: true, url });
  });
  return { fetch: fetchMock as unknown as typeof fetch, calls, refreshCalls: () => calls.filter((c) => c.url.endsWith('/refresh')).length };
}

const client = (server: ReturnType<typeof fakeServer>, session: SessionStore, onSessionExpired = vi.fn()) =>
  createApiClient({ baseUrl: 'https://fin-wall.test/', session, fetch: server.fetch, onSessionExpired, retryDelayMs: 1 });

describe('createApiClient', () => {
  it('ставит access-токен, собирает адрес с параметрами и разбирает JSON', async () => {
    const server = fakeServer();
    const api = client(server, memorySession({ accessToken: 'access-1', refreshToken: 'refresh-1' }));
    const data = await api.request<{ url: string }>('/api/v1/accounts', { query: { includeArchived: true, cursor: undefined } });
    expect(data.url).toBe('https://fin-wall.test/api/v1/accounts?includeArchived=true');
    expect(server.calls[0].auth).toBe('Bearer access-1');
    expect(server.refreshCalls()).toBe(0);
  });

  it('204 → undefined; ошибка v1 → ApiRequestError с кодом и деталями', async () => {
    const api = client(fakeServer(), memorySession({ accessToken: 'access-1', refreshToken: 'refresh-1' }));
    await expect(api.request('/api/v1/empty', { method: 'DELETE' })).resolves.toBeUndefined();
    const error = await api.request('/api/v1/missing').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({ status: 404, code: 'NOT_FOUND', message: 'Счёт не найден', details: { id: 'x' } });
  });

  it('401 → одно обновление, новый refresh-токен сохранён до повтора, запрос повторён', async () => {
    const server = fakeServer();
    // access-токен устарел: сервер уже ждёт access-1, у клиента — access-0
    const session = memorySession({ accessToken: 'access-0', refreshToken: 'refresh-1' });
    const api = client(server, session);
    await expect(api.request('/api/v1/accounts')).resolves.toMatchObject({ ok: true });
    expect(server.calls.map((c) => c.url.replace('https://fin-wall.test', ''))).toEqual(['/api/v1/accounts', '/api/auth/refresh', '/api/v1/accounts']);
    expect(server.calls[1].body).toEqual({ refreshToken: 'refresh-1' });
    expect(server.calls[2].auth).toBe('Bearer access-2');
    expect(session.saved).toEqual([{ accessToken: 'access-2', refreshToken: 'refresh-2' }]);
  });

  it('пять параллельных запросов с истёкшим токеном — одно обновление, все успешны', async () => {
    const server = fakeServer();
    const api = client(server, memorySession({ accessToken: 'access-0', refreshToken: 'refresh-1' }));
    const results = await Promise.all(Array.from({ length: 5 }, (_, i) => api.request(`/api/v1/accounts/${i}`)));
    expect(results).toHaveLength(5);
    expect(server.refreshCalls()).toBe(1);
  });

  it('холодный старт: access-токена нет, refresh-токен есть — обновление до запроса', async () => {
    const server = fakeServer();
    const api = client(server, memorySession({ refreshToken: 'refresh-1' }));
    await api.request('/api/v1/accounts');
    expect(server.calls.map((c) => c.url.replace('https://fin-wall.test', ''))).toEqual(['/api/auth/refresh', '/api/v1/accounts']);
  });

  it('сервер отклонил сессию (401 на refresh) — токены стёрты, приложение узнало, запрос вернул 401', async () => {
    const server = fakeServer({ refreshStatus: 401 });
    const session = memorySession({ accessToken: 'access-0', refreshToken: 'refresh-1' });
    const expired = vi.fn();
    const api = client(server, session, expired);
    await expect(api.request('/api/v1/accounts')).rejects.toMatchObject({ status: 401, code: 'TOKEN_EXPIRED' });
    expect(session.cleared).toBe(1);
    expect(expired).toHaveBeenCalledTimes(1);
    expect(await session.refreshToken()).toBeNull();
  });

  it('сбой сети при обновлении — один повтор, сессия цела', async () => {
    const server = fakeServer({ refreshThrows: 1 });
    const session = memorySession({ accessToken: 'access-0', refreshToken: 'refresh-1' });
    const api = client(server, session);
    await expect(api.request('/api/v1/accounts')).resolves.toMatchObject({ ok: true });
    expect(server.refreshCalls()).toBe(2);

    const offline = fakeServer({ refreshThrows: 2 });
    const kept = memorySession({ accessToken: 'access-0', refreshToken: 'refresh-1' });
    const expired = vi.fn();
    await expect(client(offline, kept, expired).request('/api/v1/accounts')).rejects.toMatchObject({ status: 401 });
    expect(kept.cleared).toBe(0);
    expect(await kept.refreshToken()).toBe('refresh-1');
    expect(expired).not.toHaveBeenCalled();
  });

  it('401 от входа не запускает обновление', async () => {
    const server = fakeServer();
    const api = client(server, memorySession({ accessToken: 'access-0', refreshToken: 'refresh-1' }));
    await expect(api.request('/api/auth/login', { method: 'POST', body: { phone: '+70000000000' } })).rejects.toMatchObject({ status: 401 });
    expect(server.refreshCalls()).toBe(0);
  });
});

describe('помощники', () => {
  it('FormData уходит как multipart: без JSON и без своего Content-Type, с токеном', async () => {
    const seen: RequestInit[] = [];
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(init!);
      return json(202, { id: 'batch-1' });
    });
    const api = createApiClient({ baseUrl: 'https://fin-wall.test', session: memorySession({ accessToken: 'access-1', refreshToken: 'refresh-1' }), fetch: fetchMock as unknown as typeof fetch });
    const form = new FormData();
    form.append('institutionCode', 'tbank');
    await expect(api.request('/api/v1/imports', { method: 'POST', body: form })).resolves.toEqual({ id: 'batch-1' });
    const headers = new Headers(seen[0].headers);
    expect(seen[0].body).toBe(form);
    expect(headers.get('Content-Type')).toBeNull();
    expect(headers.get('Authorization')).toBe('Bearer access-1');
  });

  it('withQuery пропускает пустые значения и повторяет массивы', () => {
    expect(withQuery('/x', { a: 1, b: '', c: null, d: ['p', 'q'], e: false })).toBe('/x?a=1&d=p&d=q&e=false');
    expect(withQuery('/x')).toBe('/x');
  });

  it('errorMessage: сообщение сервера, сбой сети, прочее', () => {
    expect(errorMessage(new ApiRequestError(400, 'VALIDATION', 'Сумма обязательна'))).toBe('Сумма обязательна');
    expect(errorMessage(new TypeError('Network request failed'))).toBe('Нет соединения с сервером');
    expect(errorMessage(new Error('boom'))).toBe('Что-то пошло не так');
  });
});
