/**
 * Базовая конфигурация кэширования
 */
export interface CacheConfig {
  ttl?: number;
  key?: string;
  vary?: string[];
  tags?: string[];
}

/**
 * Расширенная конфигурация кэширования
 */
export interface AdvancedCacheConfig extends CacheConfig {
  strategy?: 'memory' | 'redis' | 'hybrid';
  maxMemoryEntries?: number;
  maxMemorySize?: number;
  compression?: boolean;
  serialize?: (data: any) => string;
  deserialize?: (data: string) => any;
  warmup?: () => Promise<void>;
  onHit?: (key: string, data: any) => void;
  onMiss?: (key: string) => void;
  onEvict?: (key: string, reason: string) => void;
}

/**
 * Запись в кэше
 */
export interface CacheEntry {
  data: any;
  timestamp: number;
  ttl: number;
  tags?: string[];
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
 * Кэшированный ответ
 */
export interface CachedResponse {
  body: any;
  statusCode: number;
  headers: Record<string, string>;
  timestamp: number;
}
