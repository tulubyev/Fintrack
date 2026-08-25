import { Request, Response } from 'express';

/**
 * Расширенные метрики приложения
 */
export interface ApplicationMetrics {
  uptime: number;
  totalRequests: number;
  requestsPerMinute: number;
  averageResponseTime: number;
  activeConnections?: number;
  endpoints?: Record<string, number>;
  p95ResponseTime?: number;
  p99ResponseTime?: number;
  slowestEndpoint?: string;
  
  performance: {
    cpu: number;
    memory: number;
    heapUsed: number;
    heapTotal: number;
    rss: number;
    external: number;
  };
  
  database: {
    connectionCount: number;
    queryCount: number;
    averageQueryTime: number;
    slowQueries: number;
    failedQueries: number;
  };
  
  cache: {
    hits: number;
    misses: number;
    hitRate: number;
    entryCount: number;
    memoryUsage: number;
    size?: number;
    operations?: number;
  };
  
  errors: {
    total: number;
    rate: number;
    byType: Record<string, number>;
    last24h: number;
    recent?: Array<{ message: string; timestamp: string; }>;
  };
  
  security: {
    blockedRequests: number;
    failedLogins: number;
    suspiciousActivity: number;
    rateLimitHits: number;
  };
  
  users: {
    activeUsers: number;
    totalUsers: number;
    newUsers24h: number;
    authenticatedRequests: number;
  };
  
  business: {
    totalTransactions: number;
    successfulTransactions: number;
    failedTransactions: number;
    revenue24h: number;
  };
}

/**
 * Точка данных для временного ряда
 */
export interface DataPoint {
  timestamp: number;
  value: number;
  metadata?: Record<string, any>;
}

/**
 * Временной ряд метрик
 */
export interface TimeSeries {
  name: string;
  points: DataPoint[];
  maxPoints: number;
}

/**
 * Алерт
 */
export interface Alert {
  type: string;
  message: string;
  severity: 'low' | 'medium' | 'high';
}

/**
 * Статистика производительности
 */
export interface PerformanceStatistics {
  slowRequests: RequestLogEntry[];
  averageResponseTimeByPath: Record<string, number>;
  requestsByStatusCode: Record<number, number>;
  hourlyRequestCounts: Array<{hour: string, count: number}>;
}

/**
 * Запись лога запроса
 */
export interface RequestLogEntry {
  timestamp: string;
  method: string;
  path: string;
  statusCode: number;
  responseTime: number;
  userAgent?: string;
  ip: string;
  userId?: string;
  errorCode?: string;
  requestSize?: number;
  responseSize?: number;
}

/**
 * Опции middleware метрик
 */
export interface MetricsMiddlewareOptions {
  customMetrics?: Record<string, (req: Request, res: Response) => number>;
}
