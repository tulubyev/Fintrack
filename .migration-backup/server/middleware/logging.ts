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
// LOGGING MIDDLEWARE СИСТЕМА
// ===========================================

// Логирование использует LoggingConfig из config/environment.ts
interface LoggingMiddlewareOptions {
  customLogger?: (entry: RequestLogEntry) => void; // кастомный логгер
}

/**
 * Метрики производительности
 */
class PerformanceTracker {
  private metrics: Map<string, PerformanceMetrics> = new Map();
  private requests: RequestLogEntry[] = [];
  private readonly maxHistorySize = config.performance.metricsHistorySize;

  /**
   * Добавить запись о запросе
   */
  addRequest(entry: RequestLogEntry): void {
    this.requests.push(entry);
    
    // Ограничиваем размер истории
    if (this.requests.length > this.maxHistorySize) {
      this.requests = this.requests.slice(-this.maxHistorySize);
    }

    this.updateMetrics();
  }

  /**
   * Обновить метрики
   */
  private updateMetrics(): void {
    const now = new Date().toISOString();
    const recentRequests = this.requests.filter(
      req => new Date(req.timestamp) > new Date(Date.now() - config.performance.metricsWindowMs)
    );

    if (recentRequests.length === 0) return;

    const totalRequests = recentRequests.length;
    const averageResponseTime = recentRequests.reduce(
      (sum, req) => sum + req.responseTime, 0
    ) / totalRequests;

    const errorCount = recentRequests.filter(
      req => req.statusCode >= 400
    ).length;

    const slowRequestCount = recentRequests.filter(
      req => req.responseTime > config.performance.slowRequestThreshold
    ).length;

    const metrics: PerformanceMetrics = {
      requestCount: totalRequests,
      averageResponseTime: Math.round(averageResponseTime),
      errorRate: (errorCount / totalRequests) * 100,
      slowRequestCount,
      timestamp: now
    };

    this.metrics.set('current', metrics);
  }

  /**
   * Получить текущие метрики
   */
  getCurrentMetrics(): PerformanceMetrics | undefined {
    return this.metrics.get('current');
  }

  /**
   * Получить историю запросов
   */
  getRequestHistory(limit: number = 100): RequestLogEntry[] {
    return this.requests.slice(-limit);
  }

  /**
   * Очистить историю
   */
  clearHistory(): void {
    this.requests = [];
    this.metrics.clear();
  }
}

// Глобальный трекер производительности
const performanceTracker = new PerformanceTracker();

// ===========================================
// UTILITY ФУНКЦИИ
// ===========================================

/**
 * Маскировка чувствительных данных
 */
function maskSensitiveData(obj: any, depth: number = 0): any {
  if (depth > 3 || obj === null || typeof obj !== 'object') {
    return obj;
  }

  const sensitiveKeys = [
    'password', 'token', 'secret', 'key', 'authorization',
    'cookie', 'session', 'jwt', 'auth', 'credentials', 'pin'
  ];

  if (Array.isArray(obj)) {
    return obj.map(item => maskSensitiveData(item, depth + 1));
  }

  const masked: any = {};
  for (const [key, value] of Object.entries(obj)) {
    const isKeyLowerCase = key.toLowerCase();
    const isSensitive = sensitiveKeys.some(sensKey => 
      isKeyLowerCase.includes(sensKey)
    );

    if (isSensitive) {
      masked[key] = typeof value === 'string' && value.length > 4 
        ? `${value.substring(0, 2)}***${value.slice(-2)}`
        : '***';
    } else {
      masked[key] = maskSensitiveData(value, depth + 1);
    }
  }

  return masked;
}

/**
 * Получение размера объекта в байтах
 */
function getObjectSize(obj: any): number {
  try {
    return Buffer.byteLength(JSON.stringify(obj), 'utf8');
  } catch {
    return 0;
  }
}

/**
 * Проверка исключения пути
 */
function shouldExcludePath(path: string, excludePaths: string[]): boolean {
  return excludePaths.some(excludePath => {
    if (excludePath.includes('*')) {
      const pattern = excludePath.replace(/\*/g, '.*');
      return new RegExp(pattern).test(path);
    }
    return path === excludePath || path.startsWith(excludePath);
  });
}

// ===========================================
// CORE LOGGING MIDDLEWARE
// ===========================================

/**
 * Основной request/response логгер
 */
export const requestLogger = (options: LoggingMiddlewareOptions = {}): AsyncMiddleware => {
  const {
    customLogger
  } = options;
  
  // Используем конфигурацию из config/environment.ts
  const includeBody = config.logging.includeBody;
  const includeResponse = config.logging.includeResponse;
  const includeHeaders = config.logging.includeHeaders;
  const maskData = config.logging.maskSensitiveData;
  const logLevel = config.logging.level;
  const maxBodySize = config.logging.maxBodySize;
  const excludePaths = config.logging.excludePaths;
  const skipHealthChecks = config.logging.skipHealthChecks;

  return asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    const timestamp = new Date().toISOString();
    
    // Проверка исключений
    if (shouldExcludePath(req.path, excludePaths)) {
      return next();
    }

    if (skipHealthChecks && (req.path.includes('health') || req.path.includes('ping'))) {
      return next();
    }

    // Подготовка данных для логирования
    let requestBody: any = undefined;
    if (includeBody && req.body && getObjectSize(req.body) <= maxBodySize) {
      requestBody = maskData ? maskSensitiveData(req.body) : req.body;
    }

    let requestHeaders: any = undefined;
    if (includeHeaders) {
      requestHeaders = maskData ? maskSensitiveData(req.headers) : req.headers;
    }

    // Перехват response для логирования
    let responseBody: any = undefined;
    if (includeResponse) {
      const originalSend = res.send;
      res.send = function(data: any) {
        if (data && getObjectSize(data) <= maxBodySize) {
          try {
            responseBody = typeof data === 'string' ? JSON.parse(data) : data;
            if (maskData) {
              responseBody = maskSensitiveData(responseBody);
            }
          } catch {
            responseBody = { message: 'Response body parsing failed' };
          }
        }
        return originalSend.call(this, data);
      };
    }

    // Логирование после завершения ответа
    res.on('finish', () => {
      const responseTime = Date.now() - startTime;
      
      const logEntry: RequestLogEntry = {
        timestamp,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        responseTime,
        userAgent: req.get('user-agent'),
        ip: req.ip || req.connection.remoteAddress || 'unknown',
        userId: (req as any).user?.id,
        errorCode: (res as any).errorCode,
        requestSize: getObjectSize(req.body || {}),
        responseSize: getObjectSize(responseBody || {})
      };

      // Добавляем дополнительные данные если включены
      const enhancedEntry = {
        ...logEntry,
        ...(requestBody && { requestBody }),
        ...(responseBody && { responseBody }),
        ...(requestHeaders && { requestHeaders })
      };

      // Отправка в кастомный логгер или консоль
      if (customLogger) {
        customLogger(enhancedEntry);
      } else {
        const logMethod = res.statusCode >= 500 ? 'error' : 
                         res.statusCode >= 400 ? 'warn' : 'info';
        
        if (shouldLog(logLevel, logMethod)) {
          const logMessage = `[${timestamp}] ${req.method} ${req.path} ${res.statusCode} ${responseTime}ms`;
          const logData = JSON.stringify(enhancedEntry, null, 2);
          
          switch (logMethod) {
            case 'error':
              console.error(logMessage, logData);
              break;
            case 'warn':
              console.warn(logMessage, logData);
              break;
            case 'info':
            default:
              console.info(logMessage, logData);
              break;
          }
        }
      }

      // Добавляем в трекер производительности
      performanceTracker.addRequest(logEntry);
    });

    next();
  });
};

/**
 * Проверка уровня логирования
 */
function shouldLog(configLevel: string, messageLevel: string): boolean {
  const levels = ['debug', 'info', 'warn', 'error'];
  const configIndex = levels.indexOf(configLevel);
  const messageIndex = levels.indexOf(messageLevel);
  return messageIndex >= configIndex;
}

// ===========================================
// СПЕЦИАЛИЗИРОВАННЫЕ ЛОГГЕРЫ
// ===========================================

/**
 * Простой логгер для development (сейчас все из config)
 */
export const devLogger = requestLogger();

/**
 * Production логгер (сейчас все из config)
 */
export const prodLogger = requestLogger();

/**
 * Детальный логгер для отладки (сейчас все из config)
 */
export const debugLogger = requestLogger();

/**
 * Аудит логгер для критичных операций
 */
export const auditLogger = requestLogger({
  customLogger: (entry) => {
    // Специальный аудит лог (настройки логирования из config)
    console.log('🔍 AUDIT LOG:', JSON.stringify({
      timestamp: entry.timestamp,
      user: entry.userId || 'anonymous',
      action: `${entry.method} ${entry.path}`,
      result: entry.statusCode,
      ip: entry.ip,
      responseTime: entry.responseTime
    }, null, 2));
  }
});

// ===========================================
// METRICS & MONITORING
// ===========================================

/**
 * Middleware для метрик производительности
 */
export const metricsCollector = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    // Добавляем уникальный ID запроса
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    req.headers['x-request-id'] = requestId;
    res.setHeader('X-Request-ID', requestId);

    // Метрики времени начала
    (req as any).startTime = process.hrtime.bigint();
    
    next();
  }
);

/**
 * Endpoint для получения метрик
 */
export const getMetrics = (): PerformanceMetrics | undefined => {
  return performanceTracker.getCurrentMetrics();
};

/**
 * Endpoint для получения истории запросов
 */
export const getRequestHistory = (limit: number = 100): RequestLogEntry[] => {
  return performanceTracker.getRequestHistory(limit);
};

/**
 * Очистка истории метрик
 */
export const clearMetrics = (): void => {
  performanceTracker.clearHistory();
};

// ===========================================
// ERROR LOGGING
// ===========================================

/**
 * Специальный логгер для ошибок
 */
export const errorLogger = (error: Error, req: Request): void => {
  const errorEntry = {
    timestamp: new Date().toISOString(),
    type: 'ERROR',
    name: error.name,
    message: error.message,
    stack: error.stack,
    method: req.method,
    path: req.path,
    userAgent: req.get('user-agent'),
    ip: req.ip,
    userId: (req as any).user?.id,
    body: maskSensitiveData(req.body || {}),
    params: req.params,
    query: req.query
  };

  console.error('🚨 APPLICATION ERROR:', JSON.stringify(errorEntry, null, 2));
};

// ===========================================
// SECURITY LOGGING
// ===========================================

/**
 * Логгер событий безопасности
 */
export const securityLogger = {
  logFailedAuth: (req: Request, reason: string) => {
    console.warn('🔒 AUTH FAILURE:', JSON.stringify({
      timestamp: new Date().toISOString(),
      type: 'AUTH_FAILURE',
      reason,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      path: req.path,
      method: req.method
    }, null, 2));
  },

  logSuspiciousActivity: (req: Request, activity: string, details?: any) => {
    console.warn('⚠️ SUSPICIOUS ACTIVITY:', JSON.stringify({
      timestamp: new Date().toISOString(),
      type: 'SUSPICIOUS_ACTIVITY',
      activity,
      details: maskSensitiveData(details || {}),
      ip: req.ip,
      userAgent: req.get('user-agent'),
      path: req.path,
      method: req.method
    }, null, 2));
  },

  logAdminAction: (req: Request, action: string, target?: string) => {
    console.info('👑 ADMIN ACTION:', JSON.stringify({
      timestamp: new Date().toISOString(),
      type: 'ADMIN_ACTION',
      action,
      target,
      admin: (req as any).user?.id || 'unknown',
      ip: req.ip,
      path: req.path,
      method: req.method
    }, null, 2));
  }
};