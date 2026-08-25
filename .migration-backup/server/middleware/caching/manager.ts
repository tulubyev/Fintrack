import {
  AdvancedCacheConfig,
  CacheEntry,
  CacheStats
} from './types';

/**
 * Менеджер кэша с расширенными возможностями
 */
export class SmartCacheManager {
  private memoryCache = new Map<string, CacheEntry>();
  private accessOrder = new Map<string, number>();
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
      maxMemorySize: 100 * 1024 * 1024,
      compression: false,
      ttl: 3600,
      ...config
    };

    this.startCleanupTimer();

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

      if (this.config.strategy === 'memory' || this.config.strategy === 'hybrid') {
        entry = this.memoryCache.get(key);
      }

      if (!entry && (this.config.strategy === 'redis' || this.config.strategy === 'hybrid')) {
        entry = await this.getFromRedis(key);
        
        if (entry && this.config.strategy === 'hybrid') {
          this.setInMemory(key, entry);
        }
      }

      if (entry && this.isValidEntry(entry)) {
        this.accessOrder.set(key, Date.now());
        this.stats.hits++;
        this.updateHitRate();
        
        const responseTime = Date.now() - startTime;
        this.updateAvgResponseTime(responseTime);
        
        if (this.config.onHit) {
          this.config.onHit(key, entry.data);
        }

        return this.deserializeData(entry.data);
      } else {
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
        ttl: actualTTL * 1000,
        tags: this.config.tags || []
      };

      if (this.config.strategy === 'memory' || this.config.strategy === 'hybrid') {
        this.setInMemory(key, entry);
      }

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
      this.memoryCache.delete(key);
      this.accessOrder.delete(key);
      
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

    this.memoryCache.forEach((entry, key) => {
      if (entry.tags && entry.tags.some((tag: string) => tags.includes(tag))) {
        keysToDelete.push(key);
      }
    });

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
    this.enforceMemoryLimits();
    this.memoryCache.set(key, entry);
    this.updateStats();
  }

  private async getFromRedis(key: string): Promise<CacheEntry | undefined> {
    return undefined;
  }

  private async setInRedis(key: string, entry: CacheEntry, ttl: number): Promise<void> {
  }

  private async deleteFromRedis(key: string): Promise<void> {
  }

  private async clearRedis(): Promise<void> {
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

    if (this.memoryCache.size >= maxEntries) {
      this.evictLRU();
    }

    if (this.stats.memoryUsage >= maxSize) {
      this.evictLRU();
    }
  }

  private evictLRU(): void {
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
      totalSize += JSON.stringify(entry).length * 2;
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
    setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  private cleanup(): void {
    const expiredKeys: string[] = [];

    this.memoryCache.forEach((entry, key) => {
      if (!this.isValidEntry(entry)) {
        expiredKeys.push(key);
      }
    });

    for (const key of expiredKeys) {
      this.memoryCache.delete(key);
      this.accessOrder.delete(key);
      
      if (this.config.onEvict) {
        this.config.onEvict(key, 'expired');
      }
    }

    this.stats.lastCleanup = new Date().toISOString();
    this.updateStats();
    
    console.log(`🧹 Cache cleanup: removed ${expiredKeys.length} expired entries`);
  }
}
