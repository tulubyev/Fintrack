import { Request, Response, NextFunction } from 'express';
import type { User, AdminRole } from '@shared/schema';

// ===========================================
// УНИФИЦИРОВАННЫЕ MIDDLEWARE ТИПЫ
// ===========================================

/**
 * Расширенный Request интерфейс с пользователем
 */
export interface AuthenticatedRequest extends Request {
  user: User;
  isAuthenticated(): boolean;
}

/**
 * Опциональный Request с возможным пользователем
 */
export interface OptionalAuthRequest extends Request {
  user?: User;
}

/**
 * Стандартный middleware function type
 */
export type MiddlewareFunction = (
  req: Request, 
  res: Response, 
  next: NextFunction
) => void | Promise<void>;

/**
 * Authenticated middleware function type
 */
export type AuthenticatedMiddlewareFunction = (
  req: AuthenticatedRequest, 
  res: Response, 
  next: NextFunction
) => void | Promise<void>;

// ===========================================
// ERROR HANDLING TYPES
// ===========================================

/**
 * Стандартная структура API ошибки
 */
export interface ApiError {
  message: string;
  errorCode: string;
  status: number;
  details?: any;
  timestamp: string;
  path: string;
  method: string;
}

/**
 * Коды ошибок системы
 */
export enum ErrorCodes {
  // Authentication errors
  TOKEN_MISSING = 'TOKEN_MISSING',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED', 
  TOKEN_INVALID = 'TOKEN_INVALID',
  TOKEN_MALFORMED = 'TOKEN_MALFORMED',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  
  // Authorization errors
  ACCESS_DENIED = 'ACCESS_DENIED',
  ADMIN_REQUIRED = 'ADMIN_REQUIRED',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  
  // Validation errors
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  INVALID_DATA_FORMAT = 'INVALID_DATA_FORMAT',
  
  // Business logic errors
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  DUPLICATE_RESOURCE = 'DUPLICATE_RESOURCE',
  OPERATION_NOT_ALLOWED = 'OPERATION_NOT_ALLOWED',
  
  // System errors
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
  
  // Rate limiting
  TOO_MANY_REQUESTS = 'TOO_MANY_REQUESTS'
}

/**
 * HTTP Status codes mapping
 */
export enum HttpStatus {
  OK = 200,
  CREATED = 201,
  NO_CONTENT = 204,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  CONFLICT = 409,
  UNPROCESSABLE_ENTITY = 422,
  TOO_MANY_REQUESTS = 429,
  INTERNAL_SERVER_ERROR = 500,
  BAD_GATEWAY = 502,
  SERVICE_UNAVAILABLE = 503
}

// ===========================================
// ADMIN PERMISSION TYPES
// ===========================================

/**
 * Админские роли как строки (соответствуют varchar в БД)
 */
export type AdminRoleString = 
  | 'super_admin' 
  | 'devops_admin' 
  | 'analytics_admin' 
  | 'finance_admin' 
  | 'api_admin' 
  | 'security_admin';

/**
 * Определение прав доступа для каждой админской роли
 */
export const ADMIN_PERMISSIONS = {
  super_admin: ['*', 'users.manage'], // Полный доступ
  devops_admin: [
    'system.monitoring',
    'system.performance', 
    'system.resources',
    'system.updates',
    'system.maintenance',
    'logs.system',
    'metrics.performance'
  ],
  analytics_admin: [
    'analytics.view',
    'analytics.export',
    'reports.generate',
    'metrics.view',
    'dashboard.analytics',
    'users.analytics',
    'transactions.analytics'
  ],
  finance_admin: [
    'transactions.view',
    'transactions.manage',
    'banks.manage',
    'payments.view',
    'financial.reports',
    'compliance.view'
  ],
  api_admin: [
    'api.monitoring',
    'api.management',
    'integrations.view',
    'webhooks.manage',
    'api.alerts',
    'third_party.status'
  ],
  security_admin: [
    'security.monitoring',
    'auth.logs',
    'security.alerts',
    'ip.analysis',
    'threats.analysis',
    'access.control',
    'audit.logs',
    'documents.verify'
  ]
} as const;

export type Permission = typeof ADMIN_PERMISSIONS[AdminRoleString][number];

// ===========================================
// VALIDATION TYPES
// ===========================================

/**
 * Validation error details
 */
export interface ValidationErrorDetail {
  field: string;
  message: string;
  value?: any;
  code: string;
}

/**
 * Validation result
 */
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationErrorDetail[];
  data?: any;
}

// ===========================================
// LOGGING & METRICS TYPES
// ===========================================

/**
 * Request log entry
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
  requestSize: number;
  responseSize: number;
}

/**
 * Performance metrics
 */
export interface PerformanceMetrics {
  requestCount: number;
  averageResponseTime: number;
  errorRate: number;
  slowRequestCount: number;
  timestamp: string;
}

// ===========================================
// CACHE TYPES
// ===========================================

/**
 * Cache key configuration
 */
export interface CacheConfig {
  key: string;
  ttl: number; // seconds
  tags?: string[];
  vary?: string[]; // headers to vary cache on
}

/**
 * Cache entry
 */
export interface CacheEntry {
  data: any;
  timestamp: number;
  ttl: number;
  tags: string[];
}

// ===========================================
// UTILITY TYPES
// ===========================================

/**
 * Async middleware wrapper type
 */
export type AsyncMiddleware<T = Request> = (
  req: T,
  res: Response,
  next: NextFunction
) => void | Promise<void>;

/**
 * Generic API response structure
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: {
    timestamp: string;
    requestId?: string;
    version?: string;
  };
}

/**
 * Pagination parameters
 */
export interface PaginationParams {
  page: number;
  limit: number;
  offset: number;
}

/**
 * Paginated response
 */
export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}