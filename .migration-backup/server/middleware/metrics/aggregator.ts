import { config } from '../../../config/environment';
import { MetricsCollector } from './collector';
import {
  ApplicationMetrics,
  DataPoint,
  Alert,
  PerformanceStatistics,
  RequestLogEntry
} from './types';

/**
 * Агрегатор метрик - анализ и вычисление статистики
 */
export class MetricsAggregator {
  constructor(private collector: MetricsCollector) {}

  /**
   * Получение агрегированных данных
   */
  getAggregatedData(name: string, aggregation: 'sum' | 'avg' | 'min' | 'max' | 'count'): number {
    const points = this.collector.getTimeSeries(name);
    if (points.length === 0) return 0;

    const values = points.map(p => p.value);
    
    switch (aggregation) {
      case 'sum':
        return values.reduce((sum, val) => sum + val, 0);
      case 'avg':
        return values.reduce((sum, val) => sum + val, 0) / values.length;
      case 'min':
        return Math.min(...values);
      case 'max':
        return Math.max(...values);
      case 'count':
        return values.length;
      default:
        return 0;
    }
  }

  /**
   * Получение топ ошибок
   */
  getTopErrors(limit: number = 10): Array<{type: string, count: number}> {
    const metrics = this.collector.getCurrentMetrics();
    return Object.entries(metrics.errors.byType)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  /**
   * Получение статистики производительности
   */
  getPerformanceStats(): PerformanceStatistics {
    const now = Date.now();
    const last24h = now - (24 * 60 * 60 * 1000);
    const requestHistory = this.collector.getRequestHistory();
    const recentRequests = requestHistory.filter(r => 
      new Date(r.timestamp).getTime() > last24h
    );

    const slowRequests = recentRequests
      .filter(r => r.responseTime > config.performance.slowRequestThreshold)
      .sort((a, b) => b.responseTime - a.responseTime)
      .slice(0, 50);

    const pathTimes: Record<string, number[]> = {};
    recentRequests.forEach(r => {
      if (!pathTimes[r.path]) pathTimes[r.path] = [];
      pathTimes[r.path].push(r.responseTime);
    });

    const averageResponseTimeByPath: Record<string, number> = {};
    Object.entries(pathTimes).forEach(([path, times]) => {
      averageResponseTimeByPath[path] = times.reduce((sum, t) => sum + t, 0) / times.length;
    });

    const requestsByStatusCode: Record<number, number> = {};
    recentRequests.forEach(r => {
      requestsByStatusCode[r.statusCode] = (requestsByStatusCode[r.statusCode] || 0) + 1;
    });

    const hourlyRequestCounts: Array<{hour: string, count: number}> = [];
    for (let i = 23; i >= 0; i--) {
      const hourStart = now - (i * 60 * 60 * 1000);
      const hourEnd = hourStart + (60 * 60 * 1000);
      const count = recentRequests.filter(r => {
        const timestamp = new Date(r.timestamp).getTime();
        return timestamp >= hourStart && timestamp < hourEnd;
      }).length;
      
      hourlyRequestCounts.push({
        hour: new Date(hourStart).toISOString().substr(11, 5),
        count
      });
    }

    return {
      slowRequests,
      averageResponseTimeByPath,
      requestsByStatusCode,
      hourlyRequestCounts
    };
  }

  /**
   * Проверка алертов
   */
  checkAlerts(): Alert[] {
    const alerts: Alert[] = [];
    const metrics = this.collector.getCurrentMetrics();
    
    const alertConfig = {
      highResponseTime: config.performance.responseTimeAlertThreshold,
      highErrorRate: config.performance.errorRateThreshold,
      highMemoryUsage: 1024 * 1024 * 1024,
      lowCacheHitRate: config.performance.cacheHitThreshold
    };

    if (alertConfig.highResponseTime && metrics.averageResponseTime > alertConfig.highResponseTime) {
      alerts.push({
        type: 'HIGH_RESPONSE_TIME',
        message: `Среднее время ответа ${metrics.averageResponseTime}ms превышает лимит ${alertConfig.highResponseTime}ms`,
        severity: 'high'
      });
    }

    if (alertConfig.highErrorRate && metrics.errors.rate > alertConfig.highErrorRate) {
      alerts.push({
        type: 'HIGH_ERROR_RATE',
        message: `Частота ошибок ${metrics.errors.rate.toFixed(2)}% превышает лимит ${alertConfig.highErrorRate}%`,
        severity: 'high'
      });
    }

    if (alertConfig.highMemoryUsage && metrics.performance.memory > alertConfig.highMemoryUsage) {
      const memoryMB = Math.round(metrics.performance.memory / 1024 / 1024);
      const limitMB = Math.round(alertConfig.highMemoryUsage / 1024 / 1024);
      alerts.push({
        type: 'HIGH_MEMORY_USAGE',
        message: `Использование памяти ${memoryMB}MB превышает лимит ${limitMB}MB`,
        severity: 'medium'
      });
    }

    if (alertConfig.lowCacheHitRate && metrics.cache.hitRate < alertConfig.lowCacheHitRate) {
      const totalCacheRequests = metrics.cache.hits + metrics.cache.misses;
      if (totalCacheRequests > 10) {
        alerts.push({
          type: 'LOW_CACHE_HIT_RATE',
          message: `Hit rate кэша ${metrics.cache.hitRate.toFixed(2)}% ниже лимита ${alertConfig.lowCacheHitRate}%`,
          severity: 'medium'
        });
      }
    }

    return alerts;
  }
}
