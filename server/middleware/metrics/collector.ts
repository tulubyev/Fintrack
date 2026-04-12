import { config } from '../../../config/environment';
import {
  ApplicationMetrics,
  DataPoint,
  TimeSeries,
  RequestLogEntry,
  MetricsMiddlewareOptions
} from './types';

/**
 * Коллектор метрик - сбор и хранение данных
 */
export class MetricsCollector {
  private metrics: ApplicationMetrics;
  private timeSeries = new Map<string, TimeSeries>();
  private requestHistory: RequestLogEntry[] = [];
  private startTime = Date.now();
  private lastCollectionTime = Date.now();
  private options: MetricsMiddlewareOptions;

  constructor(options: MetricsMiddlewareOptions = {}) {
    this.options = options;
    this.metrics = this.initializeMetrics();
    this.startPeriodicCollection();
  }

  /**
   * Запись запроса для аналитики
   */
  recordRequest(entry: RequestLogEntry): void {
    this.requestHistory.push(entry);
    
    if (this.requestHistory.length > config.performance.metricsHistorySize) {
      this.requestHistory = this.requestHistory.slice(-config.performance.metricsHistorySize);
    }

    this.updateRequestMetrics(entry);
    this.recordTimeSeries('requests_per_minute', 1);
    this.recordTimeSeries('response_time', entry.responseTime);
    
    if (entry.statusCode >= 400) {
      this.recordTimeSeries('error_rate', 1);
      this.metrics.errors.total++;
      this.metrics.errors.byType[entry.statusCode.toString()] = 
        (this.metrics.errors.byType[entry.statusCode.toString()] || 0) + 1;
    }
  }

  /**
   * Запись кастомной метрики
   */
  recordCustomMetric(name: string, value: number, metadata?: Record<string, any>): void {
    this.recordTimeSeries(name, value, metadata);
  }

  /**
   * Запись бизнес события
   */
  recordBusinessEvent(event: string, value: number = 1, metadata?: Record<string, any>): void {
    switch (event) {
      case 'transaction_success':
        this.metrics.business.successfulTransactions += value;
        this.metrics.business.totalTransactions += value;
        break;
      case 'transaction_failure':
        this.metrics.business.failedTransactions += value;
        this.metrics.business.totalTransactions += value;
        break;
      case 'revenue':
        this.metrics.business.revenue24h += value;
        break;
      case 'new_user':
        this.metrics.users.newUsers24h += value;
        this.metrics.users.totalUsers += value;
        break;
      case 'user_login':
        this.metrics.users.authenticatedRequests += value;
        break;
    }
    
    this.recordTimeSeries(`business_${event}`, value, metadata);
  }

  /**
   * Запись события безопасности
   */
  recordSecurityEvent(event: string, details?: Record<string, any>): void {
    switch (event) {
      case 'blocked_request':
        this.metrics.security.blockedRequests++;
        break;
      case 'failed_login':
        this.metrics.security.failedLogins++;
        break;
      case 'suspicious_activity':
        this.metrics.security.suspiciousActivity++;
        break;
      case 'rate_limit_hit':
        this.metrics.security.rateLimitHits++;
        break;
    }
    
    this.recordTimeSeries(`security_${event}`, 1, details);
    console.warn(`🚨 Security event: ${event}`, details);
  }

  /**
   * Обновление метрик кэша
   */
  updateCacheMetrics(hits: number, misses: number, entryCount: number, memoryUsage: number): void {
    this.metrics.cache.hits = hits;
    this.metrics.cache.misses = misses;
    this.metrics.cache.entryCount = entryCount;
    this.metrics.cache.memoryUsage = memoryUsage;
    this.metrics.cache.hitRate = (hits + misses) > 0 ? (hits / (hits + misses)) * 100 : 0;
  }

  /**
   * Получение текущих метрик
   */
  getCurrentMetrics(): ApplicationMetrics {
    this.updateRealTimeMetrics();
    return JSON.parse(JSON.stringify(this.metrics));
  }

  /**
   * Получение временного ряда
   */
  getTimeSeries(name: string, timeRange?: { start: number; end: number }): DataPoint[] {
    const series = this.timeSeries.get(name);
    if (!series) return [];

    let points = series.points;
    
    if (timeRange) {
      points = points.filter(p => 
        p.timestamp >= timeRange.start && p.timestamp <= timeRange.end
      );
    }
    
    return [...points];
  }

  /**
   * Получение истории запросов
   */
  getRequestHistory(): RequestLogEntry[] {
    return [...this.requestHistory];
  }

  /**
   * Получение времени старта
   */
  getStartTime(): number {
    return this.startTime;
  }

  // ===========================================
  // PRIVATE МЕТОДЫ
  // ===========================================

  private initializeMetrics(): ApplicationMetrics {
    return {
      uptime: 0,
      totalRequests: 0,
      requestsPerMinute: 0,
      averageResponseTime: 0,
      performance: {
        cpu: 0,
        memory: 0,
        heapUsed: 0,
        heapTotal: 0,
        rss: 0,
        external: 0
      },
      database: {
        connectionCount: 0,
        queryCount: 0,
        averageQueryTime: 0,
        slowQueries: 0,
        failedQueries: 0
      },
      cache: {
        hits: 0,
        misses: 0,
        hitRate: 0,
        entryCount: 0,
        memoryUsage: 0
      },
      errors: {
        total: 0,
        rate: 0,
        byType: {},
        last24h: 0
      },
      security: {
        blockedRequests: 0,
        failedLogins: 0,
        suspiciousActivity: 0,
        rateLimitHits: 0
      },
      users: {
        activeUsers: 0,
        totalUsers: 0,
        newUsers24h: 0,
        authenticatedRequests: 0
      },
      business: {
        totalTransactions: 0,
        successfulTransactions: 0,
        failedTransactions: 0,
        revenue24h: 0
      }
    };
  }

  private recordTimeSeries(name: string, value: number, metadata?: Record<string, any>): void {
    if (!this.timeSeries.has(name)) {
      this.timeSeries.set(name, {
        name,
        points: [],
        maxPoints: 1440
      });
    }

    const series = this.timeSeries.get(name)!;
    const dataPoint: DataPoint = {
      timestamp: Date.now(),
      value,
      metadata
    };

    series.points.push(dataPoint);

    if (series.points.length > series.maxPoints) {
      series.points = series.points.slice(-series.maxPoints);
    }
  }

  private updateRequestMetrics(entry: RequestLogEntry): void {
    this.metrics.totalRequests++;
    
    const currentAvg = this.metrics.averageResponseTime;
    const totalRequests = this.metrics.totalRequests;
    this.metrics.averageResponseTime = ((currentAvg * (totalRequests - 1)) + entry.responseTime) / totalRequests;

    const oneMinuteAgo = Date.now() - 60000;
    const recentRequests = this.requestHistory.filter(r => 
      new Date(r.timestamp).getTime() > oneMinuteAgo
    );
    this.metrics.requestsPerMinute = recentRequests.length;
  }

  private updateRealTimeMetrics(): void {
    this.metrics.uptime = Date.now() - this.startTime;

    const memUsage = process.memoryUsage();
    this.metrics.performance.heapUsed = memUsage.heapUsed;
    this.metrics.performance.heapTotal = memUsage.heapTotal;
    this.metrics.performance.rss = memUsage.rss;
    this.metrics.performance.external = memUsage.external;
    this.metrics.performance.memory = memUsage.rss;

    const totalRequests = this.metrics.totalRequests;
    this.metrics.errors.rate = totalRequests > 0 
      ? (this.metrics.errors.total / totalRequests) * 100 
      : 0;

    const last24h = Date.now() - (24 * 60 * 60 * 1000);
    this.metrics.errors.last24h = this.requestHistory.filter(r => 
      new Date(r.timestamp).getTime() > last24h && r.statusCode >= 400
    ).length;
  }

  private startPeriodicCollection(): void {
    setInterval(() => {
      this.collectPeriodicMetrics();
    }, config.performance.metricsWindowMs);
  }

  private collectPeriodicMetrics(): void {
    this.updateRealTimeMetrics();
    
    this.recordTimeSeries('uptime', this.metrics.uptime);
    this.recordTimeSeries('total_requests', this.metrics.totalRequests);
    this.recordTimeSeries('average_response_time', this.metrics.averageResponseTime);
    this.recordTimeSeries('memory_usage', this.metrics.performance.memory);
    this.recordTimeSeries('error_rate', this.metrics.errors.rate);

    this.lastCollectionTime = Date.now();
  }
}
