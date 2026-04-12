// ===========================================
// ЦЕНТРАЛИЗОВАННЫЙ ЭКСПОРТ MIDDLEWARE
// ===========================================

// Core types and utilities
export * from './types';
export * from './errorHandler';

// Authentication and authorization
export * from './auth';
export * from './adminAuth';

// Validation system
export * from './validation';

// Security middleware
export * from './security';

// Logging and monitoring
export * from './logging';

// Performance middleware
export * from './caching';
export * from './transaction';
export { 
  getMetrics as getAdvancedMetrics,
  metricsCollector as advancedMetricsCollector,
  collectMetrics,
  recordMetric,
  recordSecurityEvent,
  getPerformanceStats,
  checkAlerts,
  exportMetrics,
  getSystemHealth
} from './metrics';

// ===========================================
// ГОТОВЫЕ MIDDLEWARE НАБОРЫ
// ===========================================

import { basicSecurity, apiSecurity, publicSecurity, strictSecurity } from './security';
import { devLogger, prodLogger, auditLogger } from './logging';
import { errorHandler, notFoundHandler } from './errorHandler';
import { cache as apiCache, cache as userCache, cache as adminCache } from './caching';
import { quickTransaction, strictTransaction, financialTransaction } from './transaction';
import { collectMetrics } from './metrics';

/**
 * Middleware для development окружения
 */
export const developmentMiddleware = [
  collectMetrics(),
  ...basicSecurity,
  devLogger
];

/**
 * Middleware для production окружения
 */
export const productionMiddleware = [
  collectMetrics(),
  ...publicSecurity,
  prodLogger
];

/**
 * Middleware для API endpoints
 */
export const apiMiddleware = [
  collectMetrics(),
  apiCache(),
  ...apiSecurity,
  quickTransaction
];

/**
 * Middleware для критичных операций
 */
export const criticalMiddleware = [
  collectMetrics(),
  ...strictSecurity,
  auditLogger,
  strictTransaction
];

/**
 * Error handling middleware (должен быть последним)
 */
export const errorMiddleware = [
  notFoundHandler,
  errorHandler
];

// ===========================================
// MIDDLEWARE КОМПОЗИЦИИ ПО ТИПАМ ROUTES
// ===========================================

/**
 * Middleware для публичных routes (регистрация, вход)
 */
export const publicRouteMiddleware = [
  ...basicSecurity
];

/**
 * Middleware для аутентифицированных routes
 */
export const authenticatedRouteMiddleware = [
  collectMetrics(),
  userCache(),
  ...apiSecurity,
  quickTransaction
];

/**
 * Middleware для административных routes
 */
export const adminRouteMiddleware = [
  collectMetrics(),
  adminCache(),
  ...strictSecurity,
  auditLogger,
  strictTransaction
];

/**
 * Middleware для финансовых операций
 */
export const financialRouteMiddleware = [
  collectMetrics(),
  ...criticalMiddleware,
  financialTransaction
];

/**
 * Middleware для file upload operations
 */
export const uploadRouteMiddleware = [
  ...apiSecurity
];

/**
 * Middleware для webhook endpoints
 */
export const webhookRouteMiddleware = [
  ...basicSecurity
];