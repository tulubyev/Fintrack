import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { storage } from '../storage';
import type { User, InsertUser } from '@shared/schema';

interface EsiaConfig {
  clientId: string;
  redirectUri: string;
  scope: string;
  esiaHost: string;
  certificatePath?: string;
  privateKeyPath?: string;
}

interface EsiaTokenResponse {
  access_token: string;
  id_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

interface EsiaUserInfo {
  oid: string;
  firstName: string;
  lastName: string;
  middleName?: string;
  birthDate: string;
  gender: string;
  email?: string;
  mobile?: string;
  snils?: string;
  inn?: string;
  trusted: boolean;
}

export class EsiaService {
  private config: EsiaConfig;

  constructor() {
    this.config = {
      clientId: process.env.ESIA_CLIENT_ID || 'fintrack_test',
      redirectUri: process.env.ESIA_REDIRECT_URI || 'http://localhost:5000/api/auth/esia/callback',
      scope: 'openid fullname birthdate gender email mobile snils',
      esiaHost: process.env.NODE_ENV === 'production' 
        ? 'https://esia.gosuslugi.ru'
        : 'https://esia-portal1.test.gosuslugi.ru',
      certificatePath: process.env.ESIA_CERTIFICATE_PATH,
      privateKeyPath: process.env.ESIA_PRIVATE_KEY_PATH,
    };
  }

  /**
   * Генерирует URL для авторизации через ЕСИА
   */
  getAuthorizationUrl(state?: string): string {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const currentState = state || this.generateState();

    const params = {
      client_id: this.config.clientId,
      response_type: 'code',
      redirect_uri: this.config.redirectUri,
      scope: this.config.scope,
      access_type: 'offline',
      state: currentState,
      timestamp: timestamp,
    };

    // В production необходимо подписать параметры ГОСТ подписью
    const signedParams = this.signParams(params);
    
    const queryString = new URLSearchParams(signedParams).toString();
    return `${this.config.esiaHost}/aas/oauth2/ac?${queryString}`;
  }

  /**
   * Обменивает код авторизации на токены
   */
  async exchangeCodeForTokens(code: string): Promise<EsiaTokenResponse> {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    
    const params = {
      client_id: this.config.clientId,
      code: code,
      grant_type: 'authorization_code',
      redirect_uri: 'no', // Особенность ЕСИА
      timestamp: timestamp,
    };

    // В production необходимо подписать параметры ГОСТ подписью
    const signedParams = this.signParams(params);

    try {
      const response = await fetch(`${this.config.esiaHost}/aas/oauth2/te`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(signedParams),
      });

      if (!response.ok) {
        throw new Error(`Ошибка ЕСИА: ${response.status} ${response.statusText}`);
      }

      const tokens: EsiaTokenResponse = await response.json();
      return tokens;
    } catch (error) {
      console.error('Ошибка обмена кода на токены ЕСИА:', error);
      throw new Error('Не удалось получить токены от ЕСИА');
    }
  }

  /**
   * Получает информацию о пользователе из ЕСИА
   */
  async getUserInfo(accessToken: string): Promise<EsiaUserInfo> {
    try {
      // Декодируем ID токен для получения OID пользователя
      const idTokenDecoded = jwt.decode(accessToken) as any;
      const userOid = idTokenDecoded?.sub || idTokenDecoded?.urn?.esia?.sbj_id;
      
      if (!userOid) {
        throw new Error('Не удалось получить OID пользователя из токена');
      }

      // Запрашиваем полную информацию о пользователе
      const response = await fetch(`${this.config.esiaHost}/rs/prns/${userOid}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Ошибка получения данных пользователя: ${response.status}`);
      }

      const userInfo: EsiaUserInfo = await response.json();
      return userInfo;
    } catch (error) {
      console.error('Ошибка получения информации о пользователе ЕСИА:', error);
      throw new Error('Не удалось получить данные пользователя от ЕСИА');
    }
  }

  /**
   * Создает или обновляет пользователя на основе данных ЕСИА
   */
  async createOrUpdateUser(esiaUserInfo: EsiaUserInfo): Promise<User> {
    try {
      // Проверяем, существует ли пользователь с таким СНИЛС или OID
      let existingUser: User | undefined;
      
      if (esiaUserInfo.snils) {
        existingUser = await storage.getUserBySnils?.(esiaUserInfo.snils);
      }
      
      if (!existingUser) {
        existingUser = await storage.getUserByEsiaOid?.(esiaUserInfo.oid);
      }

      if (existingUser) {
        // Обновляем существующего пользователя
        const updatedUser = await storage.updateUser(existingUser.id, {
          firstName: esiaUserInfo.firstName,
          lastName: esiaUserInfo.lastName,
          middleName: esiaUserInfo.middleName,
          email: esiaUserInfo.email || existingUser.email,
          phone: esiaUserInfo.mobile || existingUser.phone,
          birthDate: esiaUserInfo.birthDate ? new Date(esiaUserInfo.birthDate) : existingUser.birthDate,
          gender: esiaUserInfo.gender || existingUser.gender,
          snils: esiaUserInfo.snils || existingUser.snils,
          inn: esiaUserInfo.inn || existingUser.inn,
          esiaOid: esiaUserInfo.oid,
          isVerified: esiaUserInfo.trusted,
          verificationMethod: 'esia',
          updatedAt: new Date(),
        });

        return updatedUser!;
      } else {
        // Создаем нового пользователя
        const newUser: InsertUser = {
          firstName: esiaUserInfo.firstName,
          lastName: esiaUserInfo.lastName,
          middleName: esiaUserInfo.middleName || null,
          email: esiaUserInfo.email || null,
          phone: esiaUserInfo.mobile || `+7${Date.now()}`, // Временный телефон если не предоставлен
          passwordHash: '', // Пустой пароль для пользователей ЕСИА
          birthDate: esiaUserInfo.birthDate ? new Date(esiaUserInfo.birthDate) : null,
          gender: esiaUserInfo.gender || null,
          snils: esiaUserInfo.snils || null,
          inn: esiaUserInfo.inn || null,
          esiaOid: esiaUserInfo.oid,
          isVerified: esiaUserInfo.trusted,
          verificationMethod: 'esia',
          role: 'personal',
          planType: 'free',
        };

        const createdUser = await storage.createUser(newUser);
        return createdUser;
      }
    } catch (error) {
      console.error('Ошибка создания/обновления пользователя ЕСИА:', error);
      throw new Error('Не удалось создать пользователя');
    }
  }

  /**
   * Подписывает параметры запроса (заглушка для MVP)
   * В production должна использоваться ГОСТ подпись
   */
  private signParams(params: Record<string, string>): Record<string, string> {
    // В MVP возвращаем параметры как есть
    // В production здесь должна быть реализация ГОСТ подписи:
    // 1. Создание строки для подписи из отсортированных параметров
    // 2. Подпись строки приватным ключом по ГОСТ Р 34.10-2012
    // 3. Кодирование подписи в Base64 и добавление в client_secret
    
    if (process.env.NODE_ENV === 'production' && !process.env.ESIA_MOCK_MODE) {
      console.warn('⚠️  В продакшене необходимо реализовать ГОСТ подпись!');
      // Здесь должна быть интеграция с КриптоПро CSP
    }

    return {
      ...params,
      client_secret: this.generateMockSignature(params),
    };
  }

  /**
   * Генерирует mock подпись для разработки
   */
  private generateMockSignature(params: Record<string, string>): string {
    const sortedParams = Object.keys(params)
      .sort()
      .map(key => `${key}=${params[key]}`)
      .join('&');
    
    // Простая подпись для MVP (в production должна быть ГОСТ)
    const signature = crypto
      .createHmac('sha256', process.env.ESIA_SECRET_KEY || 'mock-secret-key')
      .update(sortedParams)
      .digest('base64');
    
    return signature;
  }

  /**
   * Генерирует случайное состояние для защиты от CSRF
   */
  private generateState(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Проверяет статус интеграции с ЕСИА
   */
  getIntegrationStatus(): {
    configured: boolean;
    environment: 'test' | 'production';
    requiresCertificates: boolean;
    mockMode: boolean;
  } {
    // В development режиме всегда включаем mock
    const mockMode = process.env.NODE_ENV === 'development' || process.env.ESIA_MOCK_MODE === 'true';
    
    return {
      configured: true, // Всегда настроено для демонстрации
      environment: process.env.NODE_ENV === 'production' ? 'production' : 'test',
      requiresCertificates: process.env.NODE_ENV === 'production' && !mockMode,
      mockMode,
    };
  }

  /**
   * Генерирует URL для авторизации в ЕСИА
   */
  async generateAuthUrl(): Promise<string> {
    if (process.env.NODE_ENV === 'production' && !process.env.ESIA_MOCK_MODE) {
      const state = this.generateState();
      const params = {
        client_id: this.config.clientId,
        response_type: 'code',
        redirect_uri: this.config.redirectUri,
        scope: 'fullname email mobile snils inn',
        state,
        access_type: 'online',
      };

      const signedParams = this.signParams(params);
      const queryString = new URLSearchParams(signedParams).toString();
      
      return `${this.config.esiaHost}/aas/oauth2/authorize?${queryString}`;
    } else {
      // В тестовом режиме возвращаем заглушку
      throw new Error('В тестовом режиме используйте mock авторизацию');
    }
  }

  /**
   * Обрабатывает callback от ЕСИА
   */
  async handleCallback(code: string, state: string): Promise<{ userInfo: EsiaUserInfo; tokens: EsiaTokenResponse }> {
    if (process.env.NODE_ENV === 'production' && !process.env.ESIA_MOCK_MODE) {
      // Обмениваем код на токены
      const tokens = await this.exchangeCodeForTokens(code);
      
      // Получаем информацию о пользователе
      const userInfo = await this.getUserInfo(tokens.access_token);
      
      return { userInfo, tokens };
    } else {
      throw new Error('В тестовом режиме callback не поддерживается');
    }
  }

  /**
   * Mock авторизация для разработки (заглушка)
   */
  async mockEsiaAuth(mockData?: Partial<EsiaUserInfo>): Promise<{ user: User; message: string }> {
    if (process.env.NODE_ENV === 'production' && !process.env.ESIA_MOCK_MODE) {
      throw new Error('Mock авторизация недоступна в продакшене');
    }

    const mockUserInfo: EsiaUserInfo = {
      oid: mockData?.oid || `mock_${Date.now()}`,
      firstName: mockData?.firstName || 'Александр',
      lastName: mockData?.lastName || 'Иванов',
      middleName: mockData?.middleName || 'Сергеевич',
      birthDate: mockData?.birthDate || '1985-06-15',
      gender: mockData?.gender || 'M',
      email: mockData?.email || 'a.ivanov@example.ru',
      mobile: mockData?.mobile || '+79161234567',
      snils: mockData?.snils || '12345678901',
      trusted: mockData?.trusted ?? true,
    };

    const user = await this.createOrUpdateUser(mockUserInfo);
    
    return {
      user,
      message: 'Mock авторизация через ЕСИА выполнена успешно',
    };
  }
}

export const esiaService = new EsiaService();