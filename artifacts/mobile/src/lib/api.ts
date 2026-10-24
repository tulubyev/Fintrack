import { createApiClient, type SessionStore, type SessionTokens } from '@workspace/shared/api';
import { API_URL } from './config';

/**
 * Токены сессии. Пока в памяти — после перезапуска нужен новый вход;
 * refresh-токен в SecureStore, PIN, биометрия и реакция на истёкшую сессию — E2.1-T3.
 */
let tokens: SessionTokens | null = null;

const session: SessionStore = {
  accessToken: () => tokens?.accessToken ?? null,
  refreshToken: async () => tokens?.refreshToken ?? null,
  save: async (next) => {
    tokens = next;
  },
  clear: async () => {
    tokens = null;
  },
};

export const apiClient = createApiClient({ baseUrl: API_URL, session });

export const api = apiClient.request;
