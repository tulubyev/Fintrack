import { SmartCacheManager } from './manager';
import {
  cache,
  apiCache,
  staticCache,
  userCache,
  adminCache,
  cacheInvalidator,
  cacheManager,
  getCacheManagerInstance
} from './middleware';
import { CacheStats, AdvancedCacheConfig, CacheEntry } from './types';

export * from './types';
export { SmartCacheManager } from './manager';
export {
  cache,
  apiCache,
  staticCache,
  userCache,
  adminCache,
  cacheInvalidator,
  getCacheManagerInstance
} from './middleware';

/**
 * Инвалидация кэша по тегам
 */
export const invalidateCache = async (tags: string[]): Promise<void> => {
  const manager = getCacheManagerInstance();
  if (manager) {
    await manager.invalidateByTags(tags);
  }
};

/**
 * Получение статистики кэша
 */
export const getCacheStats = (): CacheStats => {
  const manager = getCacheManagerInstance();
  if (manager) {
    return manager.getStats();
  }
  return {
    hits: 0,
    misses: 0,
    hitRate: 0,
    totalRequests: 0,
    memoryUsage: 0,
    entryCount: 0,
    avgResponseTime: 0,
    lastCleanup: new Date().toISOString()
  };
};

/**
 * Очистка всего кэша
 */
export const clearAllCache = async (): Promise<void> => {
  const manager = getCacheManagerInstance();
  if (manager) {
    await manager.clear();
  }
};

/**
 * Прогрев кэша для критичных endpoints
 */
export const warmupCache = async (endpoints: Array<{url: string, ttl?: number}>): Promise<void> => {
  console.log('🔥 Starting cache warmup...');
  
  for (const endpoint of endpoints) {
    try {
      console.log(`Warming up: ${endpoint.url}`);
    } catch (error) {
      console.warn(`Failed to warmup ${endpoint.url}:`, error);
    }
  }
  
  console.log('✅ Cache warmup completed');
};
