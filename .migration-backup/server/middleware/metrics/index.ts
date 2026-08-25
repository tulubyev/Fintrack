import { Request, Response, NextFunction } from 'express';
import { asyncHandler } from '../errorHandler';
import { AsyncMiddleware } from '../types';
import { MetricsCollector } from './collector';
import { MetricsAggregator } from './aggregator';
import { MetricsExporter } from './exporter';
import {
  ApplicationMetrics,
  DataPoint,
  Alert,
  PerformanceStatistics,
  RequestLogEntry,
  MetricsMiddlewareOptions
} from './types';

export * from './types';
export { MetricsCollector } from './collector';
export { MetricsAggregator } from './aggregator';
export { MetricsExporter } from './exporter';

const collector = new MetricsCollector();
const aggregator = new MetricsAggregator(collector);
const exporter = new MetricsExporter(collector);

/**
 * Middleware для сбора метрик
 */
export const collectMetrics = (): AsyncMiddleware => {
  return asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    const requestId = `req_${startTime}_${Math.random().toString(36).substr(2, 9)}`;
    res.setHeader('X-Request-ID', requestId);

    res.on('finish', () => {
      const responseTime = Date.now() - startTime;
      
      const logEntry: RequestLogEntry = {
        timestamp: new Date().toISOString(),
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        responseTime,
        userAgent: req.get('user-agent'),
        ip: req.ip || 'unknown',
        userId: (req as any).user?.id,
        errorCode: (res as any).errorCode,
        requestSize: JSON.stringify(req.body || {}).length,
        responseSize: parseInt(res.get('content-length') || '0')
      };

      collector.recordRequest(logEntry);
    });

    next();
  });
};

/**
 * Middleware для записи бизнес метрик
 */
export const recordBusinessMetric = (event: string, getValue?: (req: Request, res: Response) => number) => {
  return asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    res.on('finish', () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const value = getValue ? getValue(req, res) : 1;
        collector.recordBusinessEvent(event, value);
      }
    });

    next();
  });
};

// ===========================================
// UTILITY ФУНКЦИИ
// ===========================================

export const getMetrics = (): ApplicationMetrics => collector.getCurrentMetrics();

export const getTimeSeries = (name: string, timeRange?: { start: number; end: number }): DataPoint[] => 
  collector.getTimeSeries(name, timeRange);

export const recordMetric = (name: string, value: number, metadata?: Record<string, any>): void => 
  collector.recordCustomMetric(name, value, metadata);

export const recordSecurityEvent = (event: string, details?: Record<string, any>): void => 
  collector.recordSecurityEvent(event, details);

export const recordBusinessEvent = (event: string, value?: number, metadata?: Record<string, any>): void => 
  collector.recordBusinessEvent(event, value, metadata);

export const updateCacheMetrics = (hits: number, misses: number, entryCount: number, memoryUsage: number): void =>
  collector.updateCacheMetrics(hits, misses, entryCount, memoryUsage);

export const getAggregatedData = (name: string, aggregation: 'sum' | 'avg' | 'min' | 'max' | 'count'): number =>
  aggregator.getAggregatedData(name, aggregation);

export const getTopErrors = (limit?: number): Array<{type: string, count: number}> =>
  aggregator.getTopErrors(limit);

export const getPerformanceStats = (): PerformanceStatistics =>
  aggregator.getPerformanceStats();

export const checkAlerts = (): Alert[] =>
  aggregator.checkAlerts();

export const exportMetrics = (format: 'prometheus' | 'json' | 'csv'): string =>
  exporter.export(format);

export const getSystemHealth = (): {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: Record<string, boolean>;
  metrics: ApplicationMetrics;
} => {
  const metrics = getMetrics();
  const alerts = checkAlerts();
  
  const checks = {
    lowErrorRate: metrics.errors.rate < 5,
    normalResponseTime: metrics.averageResponseTime < 1000,
    memoryOk: metrics.performance.memory < 1024 * 1024 * 1024,
    cacheHealthy: metrics.cache.hitRate > 50 || (metrics.cache.hits + metrics.cache.misses) < 10
  };
  
  const failedChecks = Object.values(checks).filter(v => !v).length;
  const highSeverityAlerts = alerts.filter(a => a.severity === 'high').length;
  
  let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  if (failedChecks > 2 || highSeverityAlerts > 1) {
    status = 'unhealthy';
  } else if (failedChecks > 0 || alerts.length > 0) {
    status = 'degraded';
  }

  return { status, checks, metrics };
};
