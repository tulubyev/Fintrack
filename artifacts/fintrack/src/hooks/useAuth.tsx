/**
 * Состояние сессии веба (E1.0-T5). Единственный источник пользователя для всего приложения.
 *
 * - Пользователь и его роли берутся только из ответа сервера (/api/auth/verify): кешу в localStorage
 *   не доверяем, пока сервер не подтвердил токен, показывается скелетон.
 * - Токен доступа лежит в localStorage, refresh-токен — в HttpOnly-cookie; 401 продлевает сессию
 *   перехватчик fetch (lib/sessionRefresh). Если продлить не удалось, приходит SESSION_EXPIRED_EVENT.
 * - Сбой сети при старте не выкидывает из аккаунта: показываем «Нет соединения» с повтором.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { queryClient } from '@/lib/queryClient';
import { logoutSession, SESSION_EXPIRED_EVENT } from '@/lib/sessionRefresh';

export interface User {
  id: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  role?: string | null;
  adminRole?: string | null;
  verificationLevel2?: boolean;
  verificationLevel3?: boolean;
  profileImageUrl?: string | null;
  [key: string]: unknown;
}

type Status = 'loading' | 'ready' | 'offline';

interface AuthContextValue {
  user: User | null;
  status: Status;
  isAdmin: boolean;
  /** После входа или регистрации: токен уже сохранён формой, пользователь пришёл с сервера. */
  signIn: (user: User) => void;
  /** Локальные правки профиля (имя, фото) без повторного запроса. */
  updateUser: (patch: Partial<User>) => void;
  logout: () => Promise<void>;
  retry: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Сервер местами отдаёт snake_case — приводим к одному виду
function normalize(raw: Record<string, any>): User {
  return {
    ...raw,
    id: raw.id,
    verificationLevel2: Boolean(raw.verificationLevel2 ?? raw.verification_level_2),
    verificationLevel3: Boolean(raw.verificationLevel3 ?? raw.verification_level_3),
  };
}

function readCookie(name: string): string | null {
  const match = document.cookie.split('; ').find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

// Вход через Госуслуги возвращается на сайт с токеном в cookie (не в URL): переносим его в localStorage
function consumeEsiaCallback() {
  const token = readCookie('esia_auth_token');
  if (token && readCookie('esia_auth_success') === 'true') {
    localStorage.setItem('accessToken', token);
  }
  for (const name of ['esia_auth_token', 'esia_auth_success']) {
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
  }
  if (window.location.search.includes('esia_callback')) {
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

async function fetchCurrentUser(): Promise<User | null> {
  const token = localStorage.getItem('accessToken');
  if (!token) return null;
  // TypeError (нет сети) пробрасывается: это не повод разлогинивать
  const response = await fetch('/api/auth/verify', { headers: { Authorization: `Bearer ${token}` } });
  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) throw new Error(`verify: ${response.status}`);
  const data = await response.json();
  return normalize(data.user);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<Status>('loading');

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const current = await fetchCurrentUser();
      if (!current) {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('currentUser'); // старый кеш пользователя больше не используется
      }
      setUser(current);
      setStatus('ready');
    } catch {
      setStatus('offline');
    }
  }, []);

  useEffect(() => {
    consumeEsiaCallback();
    void load();
  }, [load]);

  useEffect(() => {
    const onExpired = () => {
      queryClient.clear();
      setUser(null);
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  const signIn = useCallback((raw: User) => {
    setUser(normalize(raw));
    setStatus('ready');
    // Роли и флаги — из /verify, а не из ответа формы
    fetchCurrentUser().then((current) => current && setUser(current)).catch(() => {});
  }, []);

  const updateUser = useCallback((patch: Partial<User>) => {
    setUser((current) => (current ? { ...current, ...patch } : current));
  }, []);

  const logout = useCallback(async () => {
    await logoutSession();
    queryClient.clear();
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    status,
    isAdmin: Boolean(user?.adminRole),
    signIn,
    updateUser,
    logout,
    retry: () => void load(),
  }), [user, status, signIn, updateUser, logout, load]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth вне AuthProvider');
  return context;
}
