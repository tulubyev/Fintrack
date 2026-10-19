import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { 
  AsyncMiddleware, 
  CacheConfig,
  CacheEntry,
  ErrorCodes,
  HttpStatus 
} from './types';
import { asyncHandler } from './errorHandler';

// ===========================================
// SMART CACHING MIDDLEWARE СИСТЕМА
// ===========================================

/**
 * Расширенная конфигурация кэширования
 */
export interface AdvancedCacheConfig extends CacheConfig {
  strategy?: 'memory' | 'redis' | 'hybrid'; // стратегия кэширования
  maxMemoryEntries?: number; // максимум записей в памяти
  maxMemorySize?: number; // максимум размера в памяти (байты)
  compression?: boolean; // сжатие данных
  serialize?: (data: any) => string; // кастомная сериализация
  deserialize?: (data: string) => any; // кастомная десериализация
  warmup?: () => Promise<void>; // предварительный прогрев кэша
  onHit?: (key: string, data: any) => void; // callback при попадании
  onMiss?: (key: string) => void; // callback при промахе
  onEvict?: (key: string, reason: string) => void; // callback при вытеснении
}

/**
 * Статистика кэша
 */
export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  totalRequests: number;
  memoryUsage: number;
  entryCount: number;
  avgResponseTime: number;
  lastCleanup: string;
}

/**
 * Менеджер кэша с расширенными возможностями
 */
class SmartCacheManager {
  private memoryCache = new Map<string, CacheEntry>();
  private accessOrder = new Map<string, number>(); // для LRU
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    hitRate: 0,
    totalRequests: 0,
    memoryUsage: 0,
    entryCount: 0,
    avgResponseTime: 0,
    lastCleanup: new Date().toISOString()
  };
  private config: Partial<AdvancedCacheConfig>;

  constructor(config: Partial<AdvancedCacheConfig> = {}) {
    this.config = {
      strategy: 'memory',
      maxMemoryEntries: 1000,
      maxMemorySize: 100 * 1024 * 1024, // 100MB
      compression: false,
      ttl: 3600, // 1 час по умолчанию
      ...config
    };

    // Запускаем периодическую очистку
    this.startCleanupTimer();

    // Прогрев кэша если настроен
    if (this.config.warmup) {
      this.config.warmup().catch(console.error);
    }
  }

  /**
   * Получение данных из кэша
   */
  async get(key: string): Promise<any | null> {
    this.stats.totalRequests++;
    const startTime = Date.now();

    try {
      let entry: CacheEntry | undefined;

      // Проверяем memory cache
      if (this.config.strategy === 'memory' || this.config.strategy === 'hybrid') {
        entry = this.memoryCache.get(key);
      }

      // Проверяем Redis cache (если доступен)
      if (!entry && (this.config.strategy === 'redis' || this.config.strategy === 'hybrid')) {
        entry = await this.getFromRedis(key);
        
        // Если нашли в Redis и это hybrid - добавляем в memory
        if (entry && this.config.strategy === 'hybrid') {
          this.setInMemory(key, entry);
        }
      }

      if (entry && this.isValidEntry(entry)) {
        // Обновляем порядок доступа для LRU
        this.accessOrder.set(key, Date.now());
        
        // Статистика и callback
        this.stats.hits++;
        this.updateHitRate();
        
        const responseTime = Date.now() - startTime;
        this.updateAvgResponseTime(responseTime);
        
        if (this.config.onHit) {
          this.config.onHit(key, entry.data);
        }

        return this.deserializeData(entry.data);
      } else {
        // Удаляем устаревшие записи
        if (entry) {
          await this.delete(key);
        }
        
        this.stats.misses++;
        this.updateHitRate();
        
        if (this.config.onMiss) {
          this.config.onMiss(key);
        }
        
        return null;
      }
    } catch (error) {
      console.error('Cache get error:', error);
      this.stats.misses++;
      this.updateHitRate();
      return null;
    }
  }

  /**
   * Сохранение данных в кэш
   */
  async set(key: string, data: any, ttl?: number): Promise<void> {
    try {
      const actualTTL = ttl || this.config.ttl || 3600;
      const serializedData = this.serializeData(data);
      
      const entry: CacheEntry = {
        data: serializedData,
        timestamp: Date.now(),
        ttl: actualTTL * 1000, // конвертируем в миллисекунды
        tags: this.config.tags || []
      };

      // Сохраняем в memory cache
      if (this.config.strategy === 'memory' || this.config.strategy === 'hybrid') {
        await this.setInMemory(key, entry);
      }

      // Сохраняем в Redis cache
      if (this.config.strategy === 'redis' || this.config.strategy === 'hybrid') {
        await this.setInRedis(key, entry, actualTTL);
      }

      this.accessOrder.set(key, Date.now());
    } catch (error) {
      console.error('Cache set error:', error);
    }
  }

  /**
   * Удаление из кэша
   */
  async delete(key: string): Promise<void> {
    try {
      // Удаляем из memory
      this.memoryCache.delete(key);
      this.accessOrder.delete(key);
      
      // Удаляем из Redis
      if (this.config.strategy === 'redis' || this.config.strategy === 'hybrid') {
        await this.deleteFromRedis(key);
      }

      this.updateStats();
    } catch (error) {
      console.error('Cache delete error:', error);
    }
  }

  /**
   * Очистка кэша по тегам
   */
  async invalidateByTags(tags: string[]): Promise<void> {
    const keysToDelete: string[] = [];

    // Проверяем memory cache
    this.memoryCache.forEach((entry, key) => {
      if (entry.tags && entry.tags.some((tag: string) => tags.includes(tag))) {
        keysToDelete.push(key);
      }
    });

    // Удаляем найденные ключи
    for (const key of keysToDelete) {
      await this.delete(key);
      
      if (this.config.onEvict) {
        this.config.onEvict(key, 'invalidated_by_tags');
      }
    }
  }

  /**
   * Получение статистики кэша
   */
  getStats(): CacheStats {
    this.updateStats();
    return { ...this.stats };
  }

  /**
   * Очистка всего кэша
   */
  async clear(): Promise<void> {
    this.memoryCache.clear();
    this.accessOrder.clear();
    
    if (this.config.strategy === 'redis' || this.config.strategy === 'hybrid') {
      await this.clearRedis();
    }
    
    this.resetStats();
  }

  // ===========================================
  // PRIVATE МЕТОДЫ
  // ===========================================

  private setInMemory(key: string, entry: CacheEntry): void {
    // Проверяем лимиты перед добавлением
    this.enforceMemoryLimits();
    
    this.memoryCache.set(key, entry);
    this.updateStats();
  }

  private async getFromRedis(key: string): Promise<CacheEntry | undefined> {
    // Заглушка для Redis - в реальном проекте здесь будет подключение к Redis
    // return await redis.get(key);
    return undefined;
  }

  private async setInRedis(key: string, entry: CacheEntry, ttl: number): Promise<void> {
    // Заглушка для Redis
    // await redis.setex(key, ttl, JSON.stringify(entry));
  }

  private async deleteFromRedis(key: string): Promise<void> {
    // Заглушка для Redis
    // await redis.del(key);
  }

  private async clearRedis(): Promise<void> {
    // Заглушка для Redis
    // await redis.flushdb();
  }

  private isValidEntry(entry: CacheEntry): boolean {
    const now = Date.now();
    return (now - entry.timestamp) < entry.ttl;
  }

  private serializeData(data: any): any {
    if (this.config.serialize) {
      return this.config.serialize(data);
    }
    
    if (this.config.compression) {
      // Простое сжатие через JSON - в реальности можно использовать gzip
      return JSON.stringify(data);
    }
    
    return data;
  }

  private deserializeData(data: any): any {
    if (this.config.deserialize) {
      return this.config.deserialize(data);
    }
    
    if (this.config.compression && typeof data === 'string') {
      try {
        return JSON.parse(data);
      } catch {
        return data;
      }
    }
    
    return data;
  }

  private enforceMemoryLimits(): void {
    const maxEntries = this.config.maxMemoryEntries || 1000;
    const maxSize = this.config.maxMemorySize || 100 * 1024 * 1024;

    // Лимит по количеству записей
    if (this.memoryCache.size >= maxEntries) {
      this.evictLRU();
    }

    // Лимит по размеру памяти
    if (this.stats.memoryUsage >= maxSize) {
      this.evictLRU();
    }
  }

  private evictLRU(): void {
    // Находим самую старую запись по LRU
    let oldestKey = '';
    let oldestTime = Date.now();

    this.accessOrder.forEach((accessTime, key) => {
      if (accessTime < oldestTime) {
        oldestTime = accessTime;
        oldestKey = key;
      }
    });

    if (oldestKey) {
      this.memoryCache.delete(oldestKey);
      this.accessOrder.delete(oldestKey);
      
      if (this.config.onEvict) {
        this.config.onEvict(oldestKey, 'lru_eviction');
      }
    }
  }

  private updateStats(): void {
    this.stats.entryCount = this.memoryCache.size;
    this.stats.memoryUsage = this.calculateMemoryUsage();
  }

  private updateHitRate(): void {
    this.stats.hitRate = this.stats.totalRequests > 0 
      ? (this.stats.hits / this.stats.totalRequests) * 100 
      : 0;
  }

  private updateAvgResponseTime(responseTime: number): void {
    const currentAvg = this.stats.avgResponseTime;
    const totalRequests = this.stats.totalRequests;
    
    this.stats.avgResponseTime = ((currentAvg * (totalRequests - 1)) + responseTime) / totalRequests;
  }

  private calculateMemoryUsage(): number {
    let totalSize = 0;
    
    this.memoryCache.forEach(entry => {
      totalSize += JSON.stringify(entry).length * 2; // примерный размер в байтах
    });
    
    return totalSize;
  }

  private resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      hitRate: 0,
      totalRequests: 0,
      memoryUsage: 0,
      entryCount: 0,
      avgResponseTime: 0,
      lastCleanup: new Date().toISOString()
    };
  }

  private startCleanupTimer(): void {
    // Очистка каждые 5 минут
    setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  private cleanup(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    // Ищем устаревшие записи
    this.memoryCache.forEach((entry, key) => {
      if (!this.isValidEntry(entry)) {
        expiredKeys.push(key);
      }
    });

    // Удаляем устаревшие записи
    for (const key of expiredKeys) {
      this.memoryCache.delete(key);
      this.accessOrder.delete(key);
      
      if (this.config.onEvict) {
        this.config.onEvict(key, 'expired');
      }
    }

    this.stats.lastCleanup = new Date().toISOString();
    this.updateStats();
    
    // Пустые проходы не пишем: иначе лог воркера и API — сплошь «removed 0» каждые несколько минут
    if (expiredKeys.length > 0) console.log(`🧹 Cache cleanup: removed ${expiredKeys.length} expired entries`);
  }
}

// Глобальный менеджер кэша
const cacheManager = new SmartCacheManager();

// ===========================================
// CACHE MIDDLEWARE ФУНКЦИИ
// ===========================================

/**
 * Генерация ключа кэша
 */
function generateCacheKey(req: Request, config: Partial<AdvancedCacheConfig>): string {
  const baseKey = config.key || `${req.method}:${req.path}`;
  
  // Учитываем vary headers если указаны
  if (config.vary && config.vary.length > 0) {
    const varyParts = config.vary.map(header => {
      const value = req.get(header) || '';
      return `${header}:${value}`;
    }).join('|');
    
    return `${baseKey}:${crypto.createHash('md5').update(varyParts).digest('hex')}`;
  }
  
  // Учитываем query параметры
  const queryString = JSON.stringify(req.query);
  const queryHash = crypto.createHash('md5').update(queryString).digest('hex');
  
  return `${baseKey}:${queryHash}`;
}

/**
 * Основной cache middleware
 */
export const cache = (config: Partial<AdvancedCacheConfig> = {}): AsyncMiddleware => {
  return asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    // Кэшируем только GET запросы по умолчанию
    if (req.method !== 'GET') {
      return next();
    }

    const cacheKey = generateCacheKey(req, config);
    const cachedData = await cacheManager.get(cacheKey);

    if (cachedData) {
      // Cache hit - возвращаем кэшированные данные
      res.setHeader('X-Cache', 'HIT');
      res.setHeader('X-Cache-Key', cacheKey);
      
      if (cachedData.headers) {
        Object.entries(cachedData.headers).forEach(([key, value]) => {
          res.setHeader(key, value as string);
        });
      }
      
      return res.status(cachedData.statusCode || 200).json(cachedData.body);
    }

    // Cache miss - перехватываем response для кэширования
    res.setHeader('X-Cache', 'MISS');
    res.setHeader('X-Cache-Key', cacheKey);

    const originalSend = res.send;
    const originalJson = res.json;

    let responseData: any;
    let statusCode: number;
    let headers: Record<string, string> = {};

    // Перехватываем res.send
    res.send = function(data: any) {
      responseData = data;
      statusCode = res.statusCode;
      
      // Собираем headers для кэширования
      Object.entries(res.getHeaders()).forEach(([key, value]) => {
        if (typeof value === 'string') {
          headers[key] = value;
        }
      });

      return originalSend.call(this, data);
    };

    // Перехватываем res.json
    res.json = function(data: any) {
      responseData = data;
      statusCode = res.statusCode;
      
      Object.entries(res.getHeaders()).forEach(([key, value]) => {
        if (typeof value === 'string') {
          headers[key] = value;
        }
      });

      return originalJson.call(this, data);
    };

    // Кэшируем после завершения ответа
    res.on('finish', async () => {
      // Кэшируем только успешные ответы
      if (statusCode >= 200 && statusCode < 300 && responseData) {
        const cacheData = {
          body: responseData,
          statusCode,
          headers,
          timestamp: Date.now()
        };

        await cacheManager.set(cacheKey, cacheData, config.ttl);
      }
    });

    next();
  });
};

// ===========================================
// СПЕЦИАЛИЗИРОВАННЫЕ CACHE MIDDLEWARE
// ===========================================

/**
 * Кэш для API endpoints с коротким TTL
 */
export const apiCache = (customConfig: Partial<AdvancedCacheConfig> = {}) => cache({
  ttl: 300, // 5 минут
  strategy: 'memory',
  tags: ['api'],
  vary: ['Authorization'],
  ...customConfig
});

/**
 * Кэш для статических данных с долгим TTL
 */
export const staticCache = (customConfig: Partial<AdvancedCacheConfig> = {}) => cache({
  ttl: 3600 * 24, // 24 часа
  strategy: 'hybrid',
  tags: ['static'],
  compression: true,
  ...customConfig
});

/**
 * Кэш для пользовательских данных
 */
export const userCache = (customConfig: Partial<AdvancedCacheConfig> = {}) => cache({
  ttl: 1800, // 30 минут
  strategy: 'memory',
  tags: ['user'],
  vary: ['Authorization'],
  maxMemoryEntries: 500,
  ...customConfig
});

/**
 * Кэш для административных данных
 */
export const adminCache = (customConfig: Partial<AdvancedCacheConfig> = {}) => cache({
  ttl: 600, // 10 минут
  strategy: 'memory',
  tags: ['admin'],
  vary: ['Authorization'],
  ...customConfig
});

// ===========================================
// CACHE UTILITIES
// ===========================================

/**
 * Инвалидация кэша по тегам
 */
export const invalidateCache = async (tags: string[]): Promise<void> => {
  await cacheManager.invalidateByTags(tags);
};

/**
 * Получение статистики кэша
 */
export const getCacheStats = (): CacheStats => {
  return cacheManager.getStats();
};

/**
 * Очистка всего кэша
 */
export const clearAllCache = async (): Promise<void> => {
  await cacheManager.clear();
};

/**
 * Прогрев кэша для критичных endpoints
 */
export const warmupCache = async (endpoints: Array<{url: string, ttl?: number}>): Promise<void> => {
  console.log('🔥 Starting cache warmup...');
  
  for (const endpoint of endpoints) {
    try {
      // Здесь можно сделать внутренние запросы к endpoints для прогрева
      console.log(`Warming up: ${endpoint.url}`);
      // const response = await fetch(`http://localhost:5000${endpoint.url}`);
      // Логика прогрева...
    } catch (error) {
      console.warn(`Failed to warmup ${endpoint.url}:`, error);
    }
  }
  
  console.log('✅ Cache warmup completed');
};

/**
 * Middleware для инвалидации кэша при модифицирующих операциях
 */
export const cacheInvalidator = (tags: string[]): AsyncMiddleware => {
  return asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    // Выполняем запрос
    await new Promise<void>((resolve) => {
      res.on('finish', async () => {
        // Инвалидируем кэш только при успешных модифицирующих операциях
        if (res.statusCode >= 200 && res.statusCode < 300) {
          if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
            await invalidateCache(tags);
            console.log(`🗑️ Cache invalidated for tags: ${tags.join(', ')}`);
          }
        }
        resolve();
      });
      
      next();
    });
  });
};