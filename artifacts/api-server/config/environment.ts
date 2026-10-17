/**
 * 🔧 Централизованная конфигурация FinTrack
 * Все настройки приложения через environment variables
 * 
 * @author FinTrack Team
 * @created 2025-09-09
 */

import path from 'node:path';

// ===========================================
// ТИПЫ КОНФИГУРАЦИИ
// ===========================================

export interface RateLimitConfig {
  windowMs: number;
  max: number;
}

export interface LoggingConfig {
  level: 'debug' | 'info' | 'warn' | 'error';
  maxBodySize: number;
  includeBody: boolean;
  includeHeaders: boolean;
  includeResponse: boolean;
  maskSensitiveData: boolean;
  skipHealthChecks: boolean;
  excludePaths: string[];
}

export interface PerformanceConfig {
  metricsHistorySize: number;
  metricsWindowMs: number;
  cacheHitThreshold: number;
  slowRequestThreshold: number;
  responseTimeAlertThreshold: number;
  errorRateThreshold: number;
}

export interface SecurityConfig {
  cors: {
    maxAge: number;
    methods: string[];
    allowedHeaders: string[];
    exposedHeaders: string[];
  };
  headers: {
    hstsMaxAge: number;
    hstsIncludeSubDomains: boolean;
    hstsPreload: boolean;
    cspDefaultSrc: string;
    cspStyleSrc: string;
    cspFontSrc: string;
    cspScriptSrc: string;
    cspImgSrc: string;
  };
  session: {
    timeout: number;
    maxLoginAttempts: number;
    lockoutDuration: number;
    passwordRequirements: {
      minLength: number;
      requireUppercase: boolean;
      requireLowercase: boolean;
      requireNumbers: boolean;
      requireSpecialChars: boolean;
    };
  };
}

export interface DatabaseConfig {
  url: string;
  ssl: boolean;
  maxConnections: number;
  connectionTimeout: number;
  queryTimeout: number;
}

export interface ExternalServicesConfig {
  openrouter: {
    apiKey: string;
    model: string;
    timeout: number;
    maxRetries: number;
  };
  smsRu: {
    apiKey: string;
    timeout: number;
    sender: string;
  };
  email: {
    host: string;
    port: number;
    user: string;
    password: string;
    secure: boolean;
    timeout: number;
  };
  esia: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    scope: string;
    environment: 'test' | 'prod';
  };
}

export interface AppConfig {
  // Основные настройки
  env: 'development' | 'production' | 'test';
  port: number;
  host: string;
  
  // Rate Limiting
  rateLimits: {
    general: RateLimitConfig;
    auth: RateLimitConfig;
    strict: RateLimitConfig;
    moderate: RateLimitConfig;
    upload: RateLimitConfig;
  };
  
  // Логирование
  logging: LoggingConfig;
  
  // Производительность и мониторинг
  performance: PerformanceConfig;
  
  // Безопасность
  security: SecurityConfig;
  
  // База данных
  database: DatabaseConfig;
  
  // Внешние сервисы
  services: ExternalServicesConfig;
  
  // Криптография
  crypto: {
    jwtSecret: string;
    jwtRefreshSecret: string;
    encryptionKey: string;
    sessionSecret: string;
  };
  
  // Cache & Session Configuration  
  cache: {
    defaultTTL: number;
    dashboardTTL: number;
    configTTL: number;
    banksTTL: number;
    accountsTTL: number;
  };
  
  session: {
    refreshTokenMaxAge: number;
  };
  
  // AI Configuration
  ai: {
    maxTokens: number;
    temperature: number;
    topP: number;
  };
  
  // File Upload Configuration
  uploads: {
    maxFileSize: number;
  };
  
  // ESIA OAuth Configuration
  esia: {
    windowMs: number;
    maxAttempts: number;
  };
  
  // Bank Connection Configuration
  banks: {
    redirectTimeoutMs: number;
    baseUrl: string;
  };
  
  // Каталоги для файлов (в Docker — именованный том)
  storage: {
    documentsDir: string;
    uploadsDir: string;
  };

  // Фронтенд
  frontend: {
    urls: string[];
    staticPath: string;
  };
}

// ===========================================
// UTILITY ФУНКЦИИ ДЛЯ ПАРСИНГА ENV
// ===========================================

/**
 * Парсинг числового значения с fallback
 */
function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;
  
  const parsed = parseFloat(value);
  if (isNaN(parsed)) {
    logger.warn(`⚠️ Некорректное числовое значение для ${key}: "${value}". Используется значение по умолчанию: ${defaultValue}`);
    return defaultValue;
  }
  
  return parsed;
}

/**
 * Парсинг boolean значения с fallback
 */
function getEnvBoolean(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (!value) return defaultValue;
  
  const normalized = value.toLowerCase().trim();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

/**
 * Парсинг массива строк из CSV с fallback
 */
function getEnvStringArray(key: string, defaultValue: string[]): string[] {
  const value = process.env[key];
  if (!value) return defaultValue;
  
  return value
    .split(',')
    .map(item => item.trim())
    .filter(item => item.length > 0);
}

/**
 * Получение обязательной переменной окружения
 */
function getEnvRequired(key: string): string {
  const value = process.env[key];
  if (!value || value.trim() === '') {
    throw new Error(`🚨 Обязательная переменная окружения ${key} не установлена`);
  }
  return value.trim();
}

/**
 * Получение переменной окружения с fallback
 */
function getEnvString(key: string, defaultValue: string): string {
  return process.env[key]?.trim() || defaultValue;
}

// ===========================================
// ОСНОВНАЯ КОНФИГУРАЦИЯ
// ===========================================

export const config: AppConfig = {
  // Основные настройки
  env: (process.env.NODE_ENV as any) || 'development',
  port: getEnvNumber('PORT', 5000),
  host: getEnvString('HOST', '0.0.0.0'),
  
  // Rate Limiting Configuration
  rateLimits: {
    general: {
      windowMs: getEnvNumber('RATE_LIMIT_GENERAL_WINDOW_MS', 15 * 60 * 1000), // 15 минут
      max: getEnvNumber('RATE_LIMIT_GENERAL_MAX', 1000)
    },
    auth: {
      windowMs: getEnvNumber('RATE_LIMIT_AUTH_WINDOW_MS', 15 * 60 * 1000), // 15 минут
      max: getEnvNumber('RATE_LIMIT_AUTH_MAX', 5)
    },
    strict: {
      windowMs: getEnvNumber('RATE_LIMIT_STRICT_WINDOW_MS', 1 * 60 * 1000), // 1 минута
      max: getEnvNumber('RATE_LIMIT_STRICT_MAX', 30)
    },
    moderate: {
      windowMs: getEnvNumber('RATE_LIMIT_MODERATE_WINDOW_MS', 1 * 60 * 1000), // 1 минута
      max: getEnvNumber('RATE_LIMIT_MODERATE_MAX', 100)
    },
    upload: {
      windowMs: getEnvNumber('RATE_LIMIT_UPLOAD_WINDOW_MS', 1 * 60 * 1000), // 1 минута
      max: getEnvNumber('RATE_LIMIT_UPLOAD_MAX', 10)
    }
  },
  
  // Logging Configuration
  logging: {
    level: (process.env.LOG_LEVEL as any) || 'info',
    maxBodySize: getEnvNumber('LOG_MAX_BODY_SIZE', 10240), // 10KB
    includeBody: getEnvBoolean('LOG_INCLUDE_BODY', false),
    includeHeaders: getEnvBoolean('LOG_INCLUDE_HEADERS', false),
    includeResponse: getEnvBoolean('LOG_INCLUDE_RESPONSE', false),
    maskSensitiveData: getEnvBoolean('LOG_MASK_SENSITIVE_DATA', true),
    skipHealthChecks: getEnvBoolean('LOG_SKIP_HEALTH_CHECKS', true),
    excludePaths: getEnvStringArray('LOG_EXCLUDE_PATHS', ['/health', '/metrics', '/favicon.ico'])
  },
  
  // Performance & Monitoring Configuration
  performance: {
    metricsHistorySize: getEnvNumber('METRICS_HISTORY_SIZE', 1000),
    metricsWindowMs: getEnvNumber('METRICS_WINDOW_MS', 60000), // 1 минута
    cacheHitThreshold: getEnvNumber('CACHE_HIT_THRESHOLD', 70), // 70%
    slowRequestThreshold: getEnvNumber('SLOW_REQUEST_THRESHOLD', 1000), // 1000ms
    responseTimeAlertThreshold: getEnvNumber('RESPONSE_TIME_ALERT_THRESHOLD', 2000), // 2000ms
    errorRateThreshold: getEnvNumber('ERROR_RATE_THRESHOLD', 5) // 5%
  },
  
  // Security Configuration
  security: {
    cors: {
      maxAge: getEnvNumber('CORS_MAX_AGE', 86400), // 24 часа
      methods: getEnvStringArray('CORS_METHODS', ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']),
      allowedHeaders: getEnvStringArray('CORS_ALLOWED_HEADERS', [
        'Origin', 'X-Requested-With', 'Content-Type', 'Accept', 
        'Authorization', 'X-API-Key', 'X-Request-ID'
      ]),
      exposedHeaders: getEnvStringArray('CORS_EXPOSED_HEADERS', [
        'X-Total-Count', 'X-Page-Count', 'X-Rate-Limit-Limit',
        'X-Rate-Limit-Remaining', 'X-Rate-Limit-Reset'
      ])
    },
    headers: {
      hstsMaxAge: getEnvNumber('HSTS_MAX_AGE', 31536000), // 1 год
      hstsIncludeSubDomains: getEnvBoolean('HSTS_INCLUDE_SUBDOMAINS', true),
      hstsPreload: getEnvBoolean('HSTS_PRELOAD', true),
      cspDefaultSrc: getEnvString('CSP_DEFAULT_SRC', "'self'"),
      cspStyleSrc: getEnvString('CSP_STYLE_SRC', "'self' 'unsafe-inline' https://fonts.googleapis.com"),
      cspFontSrc: getEnvString('CSP_FONT_SRC', "'self' https://fonts.gstatic.com"),
      cspScriptSrc: getEnvString('CSP_SCRIPT_SRC', "'self'"),
      cspImgSrc: getEnvString('CSP_IMG_SRC', "'self' data: https:")
    },
    session: {
      timeout: getEnvNumber('SESSION_TIMEOUT', 30 * 60 * 1000), // 30 минут
      maxLoginAttempts: getEnvNumber('MAX_LOGIN_ATTEMPTS', 5),
      lockoutDuration: getEnvNumber('ACCOUNT_LOCKOUT_DURATION', 15 * 60 * 1000), // 15 минут
      // Issue #10 FIX: Strong password requirements
      passwordRequirements: {
        minLength: getEnvNumber('PASSWORD_MIN_LENGTH', 12),
        requireUppercase: getEnvBoolean('PASSWORD_REQUIRE_UPPERCASE', true),
        requireLowercase: getEnvBoolean('PASSWORD_REQUIRE_LOWERCASE', true),
        requireNumbers: getEnvBoolean('PASSWORD_REQUIRE_NUMBERS', true),
        requireSpecialChars: getEnvBoolean('PASSWORD_REQUIRE_SPECIAL', true)
      }
    }
  },
  
  // Database Configuration
  database: {
    url: getEnvRequired('DATABASE_URL'),
    ssl: getEnvBoolean('DATABASE_SSL', false),
    maxConnections: getEnvNumber('DATABASE_MAX_CONNECTIONS', 10),
    connectionTimeout: getEnvNumber('DATABASE_CONNECTION_TIMEOUT', 30000), // 30 секунд
    queryTimeout: getEnvNumber('DATABASE_QUERY_TIMEOUT', 60000) // 60 секунд
  },

  // Cache Configuration
  cache: {
    defaultTTL: getEnvNumber('CACHE_DEFAULT_TTL', 5 * 60), // 5 минут
    dashboardTTL: getEnvNumber('CACHE_DASHBOARD_TTL', 5 * 60), // 5 минут
    configTTL: getEnvNumber('CACHE_CONFIG_TTL', 30 * 60), // 30 минут
    banksTTL: getEnvNumber('CACHE_BANKS_TTL', 60), // 1 минута
    accountsTTL: getEnvNumber('CACHE_ACCOUNTS_TTL', 2 * 60), // 2 минуты
  },
  
  // External Services Configuration
  services: {
    openrouter: {
      apiKey: getEnvString('OPENROUTER_API_KEY', 'dev_key'),
      model: getEnvString('OPENROUTER_MODEL', 'anthropic/claude-3.5-sonnet'),
      timeout: getEnvNumber('OPENROUTER_TIMEOUT', 30000), // 30 секунд
      maxRetries: getEnvNumber('OPENROUTER_MAX_RETRIES', 3)
    },
    smsRu: {
      apiKey: getEnvString('SMS_RU_API_KEY', 'dev_key'),
      timeout: getEnvNumber('SMS_RU_TIMEOUT', 10000), // 10 секунд
      sender: getEnvString('SMS_RU_SENDER', 'FinTrack')
    },
    email: {
      host: getEnvString('BEGET_SMTP_HOST', 'localhost'),
      port: getEnvNumber('BEGET_SMTP_PORT', 587),
      user: getEnvString('BEGET_SMTP_USER', 'dev@localhost'),
      password: getEnvString('BEGET_SMTP_PASSWORD', 'dev_password'),
      secure: getEnvBoolean('BEGET_SMTP_SECURE', false),
      timeout: getEnvNumber('EMAIL_TIMEOUT', 30000) // 30 секунд
    },
    esia: {
      clientId: getEnvString('ESIA_CLIENT_ID', 'fintrack_dev_client'),
      clientSecret: getEnvString('ESIA_CLIENT_SECRET', ''),
      redirectUri: getEnvString('ESIA_REDIRECT_URI', ''),
      scope: getEnvString('ESIA_SCOPE', 'openid fullname birthdate snils inn'),
      environment: (process.env.ESIA_ENVIRONMENT as any) || 'test'
    }
  },
  
  // Crypto Configuration
  crypto: {
    jwtSecret: getEnvRequired('JWT_SECRET'),
    jwtRefreshSecret: getEnvString('JWT_REFRESH_SECRET', ''),
    encryptionKey: getEnvRequired('ENCRYPTION_KEY'),
    sessionSecret: getEnvString('SESSION_SECRET', '')
  },
  
  // Session Configuration
  session: {
    refreshTokenMaxAge: getEnvNumber('SESSION_REFRESH_TOKEN_MAX_AGE', 7 * 24 * 60 * 60 * 1000) // 7 дней
  },
  
  // AI Configuration
  ai: {
    maxTokens: getEnvNumber('AI_MAX_TOKENS', 1000),
    temperature: getEnvNumber('AI_TEMPERATURE', 0.7),
    topP: getEnvNumber('AI_TOP_P', 1.0)
  },
  
  // File Upload Configuration
  uploads: {
    maxFileSize: getEnvNumber('UPLOAD_MAX_FILE_SIZE', 10 * 1024 * 1024) // 10MB
  },
  
  // ESIA OAuth Configuration
  esia: {
    windowMs: getEnvNumber('ESIA_RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000), // 15 minutes
    maxAttempts: getEnvNumber('ESIA_RATE_LIMIT_MAX_ATTEMPTS', 5) // 5 attempts
  },
  
  // Bank Connection Configuration
  banks: {
    redirectTimeoutMs: getEnvNumber('BANK_REDIRECT_TIMEOUT_MS', 30000), // 30 seconds
    baseUrl: getEnvString('BASE_URL', 'http://localhost:5000')
  },
  
  // File storage directories
  storage: {
    documentsDir: getEnvString('DOCUMENTS_DIR', path.join(process.cwd(), 'saveddata')),
    uploadsDir: getEnvString('UPLOADS_DIR', path.join(process.cwd(), 'uploads'))
  },

  // Frontend Configuration
  frontend: {
    urls: getEnvStringArray('FRONTEND_URL', ['http://localhost:3000']),
    staticPath: getEnvString('STATIC_PATH', '/dist/public')
  }
};

// ===========================================
// ВАЛИДАЦИЯ КОНФИГУРАЦИИ
// ===========================================

/**
 * Валидация значений конфигурации
 */
import { logger } from "../src/services/logger";

export function validateConfig(): void {
  const errors: string[] = [];
  
  // Проверка обязательных полей
  if (!config.database.url) {
    errors.push('DATABASE_URL обязателен');
  }
  
  if (!config.crypto.jwtSecret) {
    errors.push('JWT_SECRET обязателен');
  }
  
  if (!config.crypto.encryptionKey) {
    errors.push('ENCRYPTION_KEY обязателен');
  }
  
  if (!config.services.openrouter.apiKey) {
    errors.push('OPENROUTER_API_KEY обязателен');
  }
  
  if (!config.services.smsRu.apiKey) {
    errors.push('SMS_RU_API_KEY обязателен');
  }
  
  if (!config.services.email.host) {
    errors.push('BEGET_SMTP_HOST обязателен');
  }
  
  // Проверка логических значений
  if (config.performance.cacheHitThreshold < 0 || config.performance.cacheHitThreshold > 100) {
    errors.push('CACHE_HIT_THRESHOLD должен быть между 0 и 100');
  }
  
  if (config.performance.errorRateThreshold < 0 || config.performance.errorRateThreshold > 100) {
    errors.push('ERROR_RATE_THRESHOLD должен быть между 0 и 100');
  }
  
  if (config.rateLimits.auth.max > config.rateLimits.general.max) {
    logger.warn('⚠️ AUTH rate limit выше общего лимита - может быть некорректно');
  }
  
  if (config.performance.slowRequestThreshold < 100) {
    logger.warn('⚠️ SLOW_REQUEST_THRESHOLD меньше 100ms - может быть слишком строго');
  }
  
  if (config.env === 'production' && !config.crypto.jwtRefreshSecret) {
    errors.push('JWT_REFRESH_SECRET обязателен в production');
  }

  // Mock-авторизация ЕСИА в production запрещена
  if (config.env === 'production' && process.env.ESIA_MOCK_MODE === 'true') {
    errors.push('ESIA_MOCK_MODE=true запрещён в production');
  }

  // Проверка encryption key
  if (config.crypto.encryptionKey.length < 32) {
    errors.push('ENCRYPTION_KEY должен быть минимум 32 символа');
  }
  
  // Проверка портов
  if (config.port < 1 || config.port > 65535) {
    errors.push('PORT должен быть между 1 и 65535');
  }
  
  if (config.services.email.port < 1 || config.services.email.port > 65535) {
    errors.push('BEGET_SMTP_PORT должен быть между 1 и 65535');
  }
  
  // Если есть ошибки - падаем
  if (errors.length > 0) {
    logger.error('🚨 Ошибки конфигурации:');
    errors.forEach(error => logger.error(`   - ${error}`));
    throw new Error(`Некорректная конфигурация: ${errors.length} ошибок`);
  }
  
  // Логируем успешную валидацию
  logger.info('✅ Конфигурация успешно валидирована');
  
  // Предупреждения для development
  if (config.env === 'development') {
    if (config.crypto.encryptionKey.includes('0123456789abcdef')) {
      logger.warn('⚠️ Используется временный ключ шифрования для разработки');
    }
    
    if (config.logging.level === 'debug') {
      logger.warn('⚠️ Включен debug логирование - может замедлить производительность');
    }
    
    if (!config.database.ssl) {
      logger.warn('⚠️ SSL отключен для базы данных - не безопасно для production');
    }
  }
  
  // Информация о текущих настройках
  logger.info(`🔧 Конфигурация загружена:`);
  logger.info(`   - Окружение: ${config.env}`);
  logger.info(`   - Порт: ${config.port}`);
  logger.info(`   - Log level: ${config.logging.level}`);
  logger.info(`   - Rate limits: General ${config.rateLimits.general.max}/${config.rateLimits.general.windowMs/1000}s, Auth ${config.rateLimits.auth.max}/${config.rateLimits.auth.windowMs/1000}s`);
  logger.info(`   - Cache threshold: ${config.performance.cacheHitThreshold}%`);
  logger.info(`   - Frontend URLs: ${config.frontend.urls.join(', ')}`);
}

/**
 * Получение конфигурации для specific окружения
 */
export function getEnvironmentConfig(env?: string): Partial<AppConfig> {
  const targetEnv = env || config.env;
  
  switch (targetEnv) {
    case 'development':
      return {
        logging: {
          ...config.logging,
          level: 'debug',
          includeBody: true,
          includeResponse: true
        },
        rateLimits: {
          ...config.rateLimits,
          auth: { windowMs: 60000, max: 20 }, // Более мягкие лимиты для dev
          general: { windowMs: 60000, max: 5000 }
        }
      };
      
    case 'production':
      return {
        logging: {
          ...config.logging,
          level: 'warn',
          includeBody: false,
          includeResponse: false,
          maskSensitiveData: true
        },
        security: {
          ...config.security,
          headers: {
            ...config.security.headers,
            hstsMaxAge: 63072000, // 2 года для production
            hstsPreload: true
          }
        }
      };
      
    case 'test':
      return {
        logging: {
          ...config.logging,
          level: 'error', // Минимум логов в тестах
          skipHealthChecks: true
        },
        rateLimits: {
          ...config.rateLimits,
          auth: { windowMs: 1000, max: 1000 }, // Без лимитов в тестах
          general: { windowMs: 1000, max: 10000 }
        }
      };
      
    default:
      return {};
  }
}

// Экспорт для удобства
export const isDevelopment = config.env === 'development';
export const isProduction = config.env === 'production';
export const isTest = config.env === 'test';

export default config;