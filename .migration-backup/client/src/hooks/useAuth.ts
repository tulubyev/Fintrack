/**
 * Auth Hook Module - готов к выделению в библиотеку
 * React хук для управления аутентификацией
 */

import { useState, useEffect, useCallback } from 'react';
import { authService, type User } from '../services/authService';

export interface UseAuthReturn {
  user: User | null;
  loading: boolean;
  login: (identifier: string, password: string, twoFactorCode?: string) => Promise<boolean>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  isAuthenticated: boolean;
}

/**
 * Хук для управления аутентификацией
 */
export const useAuth = (): UseAuthReturn => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Инициализация при монтировании
  useEffect(() => {
    initializeAuth();
  }, []);

  const initializeAuth = async () => {
    try {
      // Сначала проверяем сохраненные данные
      const savedUser = authService.getSavedUser();
      if (savedUser) {
        setUser(savedUser);
      }

      // Проверяем токен на сервере
      const token = authService.getToken();
      if (token) {
        const verifiedUser = await authService.verifyToken();
        setUser(verifiedUser);
      }
    } catch (error) {
      console.error('Ошибка инициализации аутентификации:', error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const login = useCallback(async (identifier: string, password: string, twoFactorCode?: string): Promise<boolean> => {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ identifier, password, twoFactorCode }),
      });

      if (response.ok) {
        const data = await response.json();
        authService.setAuthData(data.accessToken, data.user);
        setUser(data.user);
        return true;
      }

      return false;
    } catch (error) {
      console.error('Ошибка входа:', error);
      return false;
    }
  }, []);

  const logout = useCallback(() => {
    authService.clearAuthData();
    setUser(null);
    
    // Опционально отправляем запрос на сервер для логаута
    fetch('/api/auth/logout', { method: 'POST' }).catch(() => {
      // Игнорируем ошибки логаута на сервере
    });
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const verifiedUser = await authService.verifyToken();
      setUser(verifiedUser);
    } catch (error) {
      console.error('Ошибка обновления пользователя:', error);
      setUser(null);
    }
  }, []);

  return {
    user,
    loading,
    login,
    logout,
    refreshUser,
    isAuthenticated: !!user,
  };
};

// Экспортируем типы
export type { User as AuthUser } from '../services/authService';