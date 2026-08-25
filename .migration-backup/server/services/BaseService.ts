import { storage, type IStorage } from "../storage";

/**
 * BaseService - базовый класс для всех доменных сервисов
 * Предоставляет общий функционал: логирование, валидация, транзакции
 */
export abstract class BaseService {
  protected storage: IStorage;

  constructor(storageInstance: IStorage = storage) {
    this.storage = storageInstance;
  }

  /**
   * Валидация пользователя ID
   */
  protected validateUserId(userId: string): void {
    if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
      throw new ValidationError('Некорректный ID пользователя');
    }
  }

  /**
   * Валидация UUID формата
   */
  protected validateUUID(value: string, fieldName: string): void {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!value || !uuidRegex.test(value)) {
      throw new ValidationError(`Некорректный ${fieldName}: должен быть валидный UUID`);
    }
  }

  /**
   * Валидация российского номера телефона
   */
  protected validateRussianPhone(phone: string): boolean {
    const phoneRegex = /^(\+7|8)[0-9]{10}$/;
    return phoneRegex.test(phone);
  }

  /**
   * Валидация email адреса
   */
  protected validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Логирование операций (упрощенная версия)
   */
  protected async auditLog(
    action: string, 
    userId: string, 
    metadata?: any
  ): Promise<void> {
    try {
      console.log(`[${new Date().toISOString()}] ${action} - User: ${userId}`, metadata);
      
      // В будущем здесь будет запись в БД через AdminLog
      if (this.storage.createAdminLog) {
        await this.storage.createAdminLog({
          adminUserId: userId,
          action,
          details: metadata ? JSON.stringify(metadata) : null,
          ipAddress: null, // TODO: получать из контекста запроса
          userAgent: null, // TODO: получать из контекста запроса
        });
      }
    } catch (error) {
      console.error('Audit log error:', error);
      // Не прерываем основную операцию из-за ошибки логирования
    }
  }

  /**
   * Обработка ошибок с логированием
   */
  protected async handleError(
    error: any, 
    context: string, 
    userId?: string
  ): Promise<never> {
    console.error(`[${context}] Error:`, error);
    
    if (userId) {
      await this.auditLog(`error_${context}`, userId, { 
        error: error.message,
        stack: error.stack 
      });
    }
    
    // Преобразуем внутренние ошибки в пользовательские
    if (error instanceof ValidationError || error instanceof BusinessError) {
      throw error;
    }
    
    throw new ServiceError(`Ошибка ${context}: ${error.message}`);
  }

  /**
   * Простое кэширование в памяти (для начала)
   */
  protected cache = new Map<string, { data: any; expires: number }>();

  protected async getFromCache<T>(key: string): Promise<T | null> {
    const cached = this.cache.get(key);
    if (!cached) return null;
    
    if (Date.now() > cached.expires) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.data as T;
  }

  protected async setCache<T>(key: string, data: T, ttlSeconds: number = 300): Promise<void> {
    this.cache.set(key, {
      data,
      expires: Date.now() + (ttlSeconds * 1000)
    });
  }

  protected async clearCache(keyPattern: string): Promise<void> {
    const keysToDelete: string[] = [];
    this.cache.forEach((_, key) => {
      if (key.includes(keyPattern)) {
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach(key => this.cache.delete(key));
  }
}

/**
 * Кастомные ошибки для бизнес-логики
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class BusinessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BusinessError';
  }
}

export class ServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ServiceError';
  }
}

export class NotFoundError extends Error {
  constructor(resource: string, id?: string) {
    super(`${resource}${id ? ` с ID ${id}` : ''} не найден`);
    this.name = 'NotFoundError';
  }
}

export class UnauthorizedError extends Error {
  constructor(message: string = 'Недостаточно прав доступа') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}