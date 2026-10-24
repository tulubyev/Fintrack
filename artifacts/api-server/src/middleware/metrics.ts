import { Request, Response, NextFunction } from 'express';
import { 
  AsyncMiddleware, 
  RequestLogEntry,
  PerformanceMetrics,
  ErrorCodes,
  HttpStatus 
} from './types';
import { asyncHandler } from './errorHandler';
import { config } from '../../config/environment';

// ===========================================
// ADVANCED METRICS COLLECTION СИСТЕМА
// ===========================================

/**
 * Расширенные метрики приложения
 */
export interface ApplicationMetrics {
  // Общие метрики
  uptime: number;
  totalRequests: number;
  requestsPerMinute: number;
  averageResponseTime: number;
  
  // Метрики производительности
  performance: {
    cpu: number; // использование CPU в %
    memory: number; // использование памяти в байтах
    heapUsed: number; // используемая heap память
    heapTotal: number; // общая heap память
    rss: number; // резидентная память
    external: number; // внешняя память
  };
  
  // Метрики базы данных
  database: {
    connectionCount: number;
    queryCount: number;
    averageQueryTime: number;
    slowQueries: number;
    failedQueries: number;
  };
  
  // Метрики кэша
  cache: {
    hits: number;
    misses: number;
    hitRate: number;
    entryCount: number;
    memoryUsage: number;
  };
  
  // Метрики ошибок
  errors: {
    total: number;
    rate: number;
    byType: Record<string, number>;
    last24h: number;
  };
  
  // Метрики безопасности
  security: {
    blockedRequests: number;
    failedLogins: number;
    suspiciousActivity: number;
    rateLimitHits: number;
  };
  
  // Пользовательские метрики
  users: {
    activeUsers: number;
    totalUsers: number;
    newUsers24h: number;
    authenticatedRequests: number;
  };
  
  // Бизнес метрики
  business: {
    totalTransactions: number;
    successfulTransactions: number;
    failedTransactions: number;
    revenue24h: number;
  };
}

// Метрики используют MetricsConfig из config/environment.ts
interface MetricsMiddlewareOptions {
  customMetrics?: Record<string, (req: Request, res: Response) => number>;
}

/**
 * Точка данных для временного ряда
 */
interface DataPoint {
  timestamp: number;
  value: number;
  metadata?: Record<string, any>;
}

/**
 * Временной ряд метрик
 */
interface TimeSeries {
  name: string;
  points: DataPoint[];
  maxPoints: number;
}

/**
 * Продвинутый коллектор метрик
 */
class AdvancedMetricsCollector {
  private metrics: ApplicationMetrics;
  private timeSeries = new Map<string, TimeSeries>();
  private requestHistory: RequestLogEntry[] = [];
  private options: MetricsMiddlewareOptions;
  private startTime = Date.now();
  private lastCollectionTime = Date.now();

  constructor(options: MetricsMiddlewareOptions = {}) {
    this.options = options;
    // Все настройки метрик теперь из config/environment.ts

    this.metrics = this.initializeMetrics();
    this.startPeriodicCollection();
  }

  /**
   * Запись запроса для аналитики
   */
  recordRequest(entry: RequestLogEntry): void {
    this.requestHistory.push(entry);
    
    // Ограничиваем размер истории из config
    if (this.requestHistory.length > config.performance.metricsHistorySize) {
      this.requestHistory = this.requestHistory.slice(-config.performance.metricsHistorySize);
    }

    // Обновляем базовые метрики
    this.updateRequestMetrics(entry);
    
    // Записываем в временные ряды
    this.recordTimeSeries('requests_per_minute', 1);
    this.recordTimeSeries('response_time', entry.responseTime);
    
    // Разбивка — по всем 4xx и 5xx; в частоту ошибок сервиса идут только 5xx: 401 при обновлении токена,
    // 404 и ошибки валидации — нормальная работа клиентов, а не сбой
    if (entry.statusCode >= 400) {
      this.metrics.errors.byType[entry.statusCode.toString()] = 
        (this.metrics.errors.byType[entry.statusCode.toString()] || 0) + 1;
    }
    if (entry.statusCode >= 500) {
      this.recordTimeSeries('error_rate', 1);
      this.metrics.errors.total++;
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
    
    // Логируем критичные события безопасности
    console.warn(`🚨 Security event: ${event}`, details);
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
   * Получение агрегированных данных
   */
  getAggregatedData(name: string, aggregation: 'sum' | 'avg' | 'min' | 'max' | 'count'): number {
    const series = this.timeSeries.get(name);
    if (!series || series.points.length === 0) return 0;

    const values = series.points.map(p => p.value);
    
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
    return Object.entries(this.metrics.errors.byType)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  /**
   * Получение статистики производительности
   */
  getPerformanceStats(): {
    slowRequests: RequestLogEntry[];
    averageResponseTimeByPath: Record<string, number>;
    requestsByStatusCode: Record<number, number>;
    hourlyRequestCounts: Array<{hour: string, count: number}>;
  } {
    const now = Date.now();
    const last24h = now - (24 * 60 * 60 * 1000);
    const recentRequests = this.requestHistory.filter(r => 
      new Date(r.timestamp).getTime() > last24h
    );

    // Медленные запросы
    const slowRequests = recentRequests
      .filter(r => r.responseTime > config.performance.slowRequestThreshold)
      .sort((a, b) => b.responseTime - a.responseTime)
      .slice(0, 50);

    // Среднее время ответа по путям
    const pathTimes: Record<string, number[]> = {};
    recentRequests.forEach(r => {
      if (!pathTimes[r.path]) pathTimes[r.path] = [];
      pathTimes[r.path].push(r.responseTime);
    });

    const averageResponseTimeByPath: Record<string, number> = {};
    Object.entries(pathTimes).forEach(([path, times]) => {
      averageResponseTimeByPath[path] = times.reduce((sum, t) => sum + t, 0) / times.length;
    });

    // Запросы по статус кодам
    const requestsByStatusCode: Record<number, number> = {};
    recentRequests.forEach(r => {
      requestsByStatusCode[r.statusCode] = (requestsByStatusCode[r.statusCode] || 0) + 1;
    });

    // Почасовая статистика
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
  checkAlerts(): Array<{type: string, message: string, severity: 'low' | 'medium' | 'high'}> {
    const alerts: Array<{type: string, message: string, severity: 'low' | 'medium' | 'high'}> = [];
    // Используем threshold поля из performance config
    const alertConfig = {
      highResponseTime: config.performance.responseTimeAlertThreshold,
      highErrorRate: config.performance.errorRateThreshold,
      highMemoryUsage: 1024 * 1024 * 1024, // 1GB - оставим хардкод
      lowCacheHitRate: config.performance.cacheHitThreshold
    };

    if (!alertConfig) return alerts;

    // Проверка времени ответа
    if (alertConfig.highResponseTime && this.metrics.averageResponseTime > alertConfig.highResponseTime) {
      alerts.push({
        type: 'HIGH_RESPONSE_TIME',
        message: `Среднее время ответа ${this.metrics.averageResponseTime}ms превышает лимит ${alertConfig.highResponseTime}ms`,
        severity: 'high'
      });
    }

    // Проверка частоты ошибок
    if (alertConfig.highErrorRate && this.metrics.errors.rate > alertConfig.highErrorRate) {
      alerts.push({
        type: 'HIGH_ERROR_RATE',
        message: `Частота ошибок ${this.metrics.errors.rate.toFixed(2)}% превышает лимит ${alertConfig.highErrorRate}%`,
        severity: 'high'
      });
    }

    // Проверка использования памяти
    if (alertConfig.highMemoryUsage && this.metrics.performance.memory > alertConfig.highMemoryUsage) {
      const memoryMB = Math.round(this.metrics.performance.memory / 1024 / 1024);
      const limitMB = Math.round(alertConfig.highMemoryUsage / 1024 / 1024);
      alerts.push({
        type: 'HIGH_MEMORY_USAGE',
        message: `Использование памяти ${memoryMB}MB превышает лимит ${limitMB}MB`,
        severity: 'medium'
      });
    }

    // Проверка hit rate кэша — только если через кэш шли запросы, иначе 0% при пустом кэше давал вечный алерт
    const cacheRequests = this.metrics.cache.hits + this.metrics.cache.misses;
    if (alertConfig.lowCacheHitRate && cacheRequests > 10 && this.metrics.cache.hitRate < alertConfig.lowCacheHitRate) {
      alerts.push({
        type: 'LOW_CACHE_HIT_RATE',
        message: `Hit rate кэша ${this.metrics.cache.hitRate.toFixed(2)}% ниже лимита ${alertConfig.lowCacheHitRate}%`,
        severity: 'medium'
      });
    }

    return alerts;
  }

  /**
   * Экспорт метрик для внешних систем мониторинга
   */
  exportMetrics(format: 'prometheus' | 'json' | 'csv'): string {
    switch (format) {
      case 'prometheus':
        return this.exportPrometheusMetrics();
      case 'json':
        return JSON.stringify(this.getCurrentMetrics(), null, 2);
      case 'csv':
        return this.exportCSVMetrics();
      default:
        return JSON.stringify(this.getCurrentMetrics(), null, 2);
    }
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
        maxPoints: 1440 // 24 часа по минутам
      });
    }

    const series = this.timeSeries.get(name)!;
    const dataPoint: DataPoint = {
      timestamp: Date.now(),
      value,
      metadata
    };

    series.points.push(dataPoint);

    // Ограничиваем количество точек
    if (series.points.length > series.maxPoints) {
      series.points = series.points.slice(-series.maxPoints);
    }
  }

  private updateRequestMetrics(entry: RequestLogEntry): void {
    this.metrics.totalRequests++;
    
    // Обновляем среднее время ответа
    const currentAvg = this.metrics.averageResponseTime;
    const totalRequests = this.metrics.totalRequests;
    this.metrics.averageResponseTime = ((currentAvg * (totalRequests - 1)) + entry.responseTime) / totalRequests;

    // Запросы в минуту (за последние 60 секунд)
    const oneMinuteAgo = Date.now() - 60000;
    const recentRequests = this.requestHistory.filter(r => 
      new Date(r.timestamp).getTime() > oneMinuteAgo
    );
    this.metrics.requestsPerMinute = recentRequests.length;
  }

  private updateRealTimeMetrics(): void {
    // Время работы
    this.metrics.uptime = Date.now() - this.startTime;

    // Метрики производительности (всегда включены)
    if (true) {
      const memUsage = process.memoryUsage();
      this.metrics.performance.heapUsed = memUsage.heapUsed;
      this.metrics.performance.heapTotal = memUsage.heapTotal;
      this.metrics.performance.rss = memUsage.rss;
      this.metrics.performance.external = memUsage.external;
      this.metrics.performance.memory = memUsage.rss;
    }

    // Частота ошибок
    const totalRequests = this.metrics.totalRequests;
    this.metrics.errors.rate = totalRequests > 0 
      ? (this.metrics.errors.total / totalRequests) * 100 
      : 0;

    // Ошибки за последние 24 часа
    const last24h = Date.now() - (24 * 60 * 60 * 1000);
    this.metrics.errors.last24h = this.requestHistory.filter(r => 
      new Date(r.timestamp).getTime() > last24h && r.statusCode >= 500
    ).length;
  }

  private startPeriodicCollection(): void {
    // Используем metricsWindowMs как интервал сбора
    setInterval(() => {
      this.collectPeriodicMetrics();
    }, config.performance.metricsWindowMs);
  }

  private collectPeriodicMetrics(): void {
    this.updateRealTimeMetrics();
    
    // Записываем основные метрики в временные ряды
    this.recordTimeSeries('uptime', this.metrics.uptime);
    this.recordTimeSeries('total_requests', this.metrics.totalRequests);
    this.recordTimeSeries('average_response_time', this.metrics.averageResponseTime);
    this.recordTimeSeries('memory_usage', this.metrics.performance.memory);
    this.recordTimeSeries('error_rate', this.metrics.errors.rate);

    // Проверяем алерты (логирование отключено для чистоты консоли)
    const alerts = this.checkAlerts();
    // if (alerts.length > 0) {
    //   alerts.forEach(alert => {
    //     console.warn(`🚨 ALERT [${alert.severity.toUpperCase()}]: ${alert.message}`);
    //   });
    // }

    this.lastCollectionTime = Date.now();
  }

  private exportPrometheusMetrics(): string {
    const metrics = this.getCurrentMetrics();
    const lines: string[] = [];

    // Экспорт в формате Prometheus
    lines.push(`# HELP fintrack_uptime_seconds Application uptime in seconds`);
    lines.push(`# TYPE fintrack_uptime_seconds counter`);
    lines.push(`fintrack_uptime_seconds ${metrics.uptime / 1000}`);

    lines.push(`# HELP fintrack_requests_total Total number of requests`);
    lines.push(`# TYPE fintrack_requests_total counter`);
    lines.push(`fintrack_requests_total ${metrics.totalRequests}`);

    lines.push(`# HELP fintrack_response_time_seconds Average response time in seconds`);
    lines.push(`# TYPE fintrack_response_time_seconds gauge`);
    lines.push(`fintrack_response_time_seconds ${metrics.averageResponseTime / 1000}`);

    lines.push(`# HELP fintrack_memory_bytes Memory usage in bytes`);
    lines.push(`# TYPE fintrack_memory_bytes gauge`);
    lines.push(`fintrack_memory_bytes ${metrics.performance.memory}`);

    return lines.join('\n');
  }

  private exportCSVMetrics(): string {
    const metrics = this.getCurrentMetrics();
    const lines: string[] = [];

    lines.push('metric,value,timestamp');
    lines.push(`uptime,${metrics.uptime},${Date.now()}`);
    lines.push(`total_requests,${metrics.totalRequests},${Date.now()}`);
    lines.push(`average_response_time,${metrics.averageResponseTime},${Date.now()}`);
    lines.push(`memory_usage,${metrics.performance.memory},${Date.now()}`);
    lines.push(`error_rate,${metrics.errors.rate},${Date.now()}`);

    return lines.join('\n');
  }
}

// Глобальный коллектор метрик
const metricsCollector = new AdvancedMetricsCollector();

// ===========================================
// MIDDLEWARE ФУНКЦИИ
// ===========================================

/**
 * Основной middleware для сбора метрик
 */
export const collectMetrics = (): AsyncMiddleware => {
  return asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();

    // Добавляем headers для трекинга
    const requestId = `req_${startTime}_${Math.random().toString(36).substr(2, 9)}`;
    res.setHeader('X-Request-ID', requestId);

    // Обработка завершения запроса
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

      metricsCollector.recordRequest(logEntry);
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
        metricsCollector.recordBusinessEvent(event, value);
      }
    });

    next();
  });
};

// ===========================================
// UTILITY ФУНКЦИИ
// ===========================================

/**
 * Получение текущих метрик
 */
export const getMetrics = (): ApplicationMetrics => {
  return metricsCollector.getCurrentMetrics();
};

/**
 * Получение временного ряда
 */
export const getTimeSeries = (name: string, timeRange?: { start: number; end: number }): DataPoint[] => {
  return metricsCollector.getTimeSeries(name, timeRange);
};

/**
 * Запись кастомной метрики
 */
export const recordMetric = (name: string, value: number, metadata?: Record<string, any>): void => {
  metricsCollector.recordCustomMetric(name, value, metadata);
};

/**
 * Запись события безопасности
 */
export const recordSecurityEvent = (event: string, details?: Record<string, any>): void => {
  metricsCollector.recordSecurityEvent(event, details);
};

/**
 * Получение статистики производительности
 */
export const getPerformanceStats = () => {
  return metricsCollector.getPerformanceStats();
};

/**
 * Проверка алертов
 */
export const checkAlerts = () => {
  return metricsCollector.checkAlerts();
};

/**
 * Экспорт метрик
 */
export const exportMetrics = (format: 'prometheus' | 'json' | 'csv' = 'json'): string => {
  return metricsCollector.exportMetrics(format);
};

// ===========================================
// HEALTH CHECK FUNCTIONS
// ===========================================

/**
 * Проверка здоровья системы
 */
export const getSystemHealth = (): {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: Record<string, boolean>;
  metrics: ApplicationMetrics;
} => {
  const metrics = getMetrics();
  const alerts = checkAlerts();
  
  const checks = {
    responseTime: metrics.averageResponseTime < 2000,
    errorRate: metrics.errors.rate < 5,
    memory: metrics.performance.memory < (512 * 1024 * 1024), // 512MB
    uptime: metrics.uptime > 60000 // больше минуты
  };

  const healthyChecks = Object.values(checks).filter(Boolean).length;
  const totalChecks = Object.values(checks).length;
  
  let status: 'healthy' | 'degraded' | 'unhealthy';
  if (healthyChecks === totalChecks) {
    status = 'healthy';
  } else if (healthyChecks >= totalChecks * 0.5) {
    status = 'degraded';
  } else {
    status = 'unhealthy';
  }

  return { status, checks, metrics };
};

/**
 * Экспорт коллектора для использования в других модулях
 */
export { metricsCollector };