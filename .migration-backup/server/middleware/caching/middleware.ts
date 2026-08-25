import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { asyncHandler } from '../errorHandler';
import { AsyncMiddleware } from '../types';
import { SmartCacheManager } from './manager';
import { AdvancedCacheConfig } from './types';

const cacheManager = new SmartCacheManager();

/**
 * Генерация ключа кэша
 */
function generateCacheKey(req: Request, config: Partial<AdvancedCacheConfig>): string {
  const baseKey = config.key || `${req.method}:${req.path}`;
  
  if (config.vary && config.vary.length > 0) {
    const varyParts = config.vary.map(header => {
      const value = req.get(header) || '';
      return `${header}:${value}`;
    }).join('|');
    
    return `${baseKey}:${crypto.createHash('md5').update(varyParts).digest('hex')}`;
  }
  
  const queryString = JSON.stringify(req.query);
  const queryHash = crypto.createHash('md5').update(queryString).digest('hex');
  
  return `${baseKey}:${queryHash}`;
}

/**
 * Основной cache middleware
 */
export const cache = (config: Partial<AdvancedCacheConfig> = {}): AsyncMiddleware => {
  return asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET') {
      return next();
    }

    const cacheKey = generateCacheKey(req, config);
    const cachedData = await cacheManager.get(cacheKey);

    if (cachedData) {
      res.setHeader('X-Cache', 'HIT');
      res.setHeader('X-Cache-Key', cacheKey);
      
      if (cachedData.headers) {
        Object.entries(cachedData.headers).forEach(([key, value]) => {
          res.setHeader(key, value as string);
        });
      }
      
      return res.status(cachedData.statusCode || 200).json(cachedData.body);
    }

    res.setHeader('X-Cache', 'MISS');
    res.setHeader('X-Cache-Key', cacheKey);

    const originalSend = res.send;
    const originalJson = res.json;

    let responseData: any;
    let statusCode: number;
    let headers: Record<string, string> = {};

    res.send = function(data: any) {
      responseData = data;
      statusCode = res.statusCode;
      
      Object.entries(res.getHeaders()).forEach(([key, value]) => {
        if (typeof value === 'string') {
          headers[key] = value;
        }
      });

      return originalSend.call(this, data);
    };

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

    res.on('finish', async () => {
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

/**
 * Кэш для API endpoints с коротким TTL
 */
export const apiCache = (customConfig: Partial<AdvancedCacheConfig> = {}) => cache({
  ttl: 300,
  strategy: 'memory',
  tags: ['api'],
  vary: ['Authorization'],
  ...customConfig
});

/**
 * Кэш для статических данных с долгим TTL
 */
export const staticCache = (customConfig: Partial<AdvancedCacheConfig> = {}) => cache({
  ttl: 3600 * 24,
  strategy: 'hybrid',
  tags: ['static'],
  compression: true,
  ...customConfig
});

/**
 * Кэш для пользовательских данных
 */
export const userCache = (customConfig: Partial<AdvancedCacheConfig> = {}) => cache({
  ttl: 1800,
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
  ttl: 600,
  strategy: 'memory',
  tags: ['admin'],
  vary: ['Authorization'],
  ...customConfig
});

/**
 * Middleware для инвалидации кэша при модифицирующих операциях
 */
export const cacheInvalidator = (tags: string[]): AsyncMiddleware => {
  return asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    await new Promise<void>((resolve) => {
      res.on('finish', async () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
            await cacheManager.invalidateByTags(tags);
            console.log(`🗑️ Cache invalidated for tags: ${tags.join(', ')}`);
          }
        }
        resolve();
      });
      
      next();
    });
  });
};

export { cacheManager };
export const getCacheManagerInstance = () => cacheManager;
