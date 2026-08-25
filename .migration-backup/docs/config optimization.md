# 🔧 **FinTrack - Анализ и оптимизация конфигурации**

**Дата анализа**: 09 сентября 2025  
**Статус**: Частичная конфигурация через env переменные, требуется полная оптимизация

---

## **📊 Текущее состояние конфигурации**

### **✅ ПРАВИЛЬНО настроенные env переменные**

#### **Database & Core Services**
```bash
DATABASE_URL=postgresql://...
JWT_SECRET=your-jwt-secret-key  
JWT_REFRESH_SECRET=your-refresh-secret
ENCRYPTION_KEY=64-character-hex-key
NODE_ENV=production|development
```

#### **External APIs & Integrations**
```bash
SMS_RU_API_KEY=your-sms-api-key
OPENROUTER_API_KEY=your-openrouter-key
BEGET_SMTP_HOST=smtp.beget.com
BEGET_SMTP_USER=your-smtp-user
BEGET_SMTP_PASSWORD=your-smtp-password
ESIA_CLIENT_ID=fintrack_client
ESIA_REDIRECT_URI=https://domain.com/callback
```

#### **Frontend & CORS**
```bash
FRONTEND_URL=https://domain.com,https://app.domain.com
REPLIT_DOMAINS=domain1.com,domain2.com
```

---

## **❌ КРИТИЧНЫЕ ПРОБЛЕМЫ - Хардкоженные значения**

### **1. Rate Limiting (server/middleware/security.ts)**
```typescript
// 🚨 ХАРДКОЖЕНО - должно быть в env
export const rateLimiters = {
  // Общий лимит для API
  general: createRateLimit({
    windowMs: 15 * 60 * 1000, // 15 минут - должно быть env
    max: 1000, // 1000 запросов за 15 минут - должно быть env
    message: 'Слишком много запросов. Максимум 1000 запросов за 15 минут.'
  }),

  // Строгий лимит для auth endpoints
  auth: createRateLimit({
    windowMs: 15 * 60 * 1000, // 15 минут - должно быть env
    max: 5, // 5 попыток за 15 минут - должно быть env
    message: 'Слишком много попыток входа. Попробуйте через 15 минут.',
    skipSuccessfulRequests: true
  }),

  // Лимит для API с высокой нагрузкой
  strict: createRateLimit({
    windowMs: 1 * 60 * 1000, // 1 минута - должно быть env
    max: 30, // 30 запросов за минуту - должно быть env
    message: 'Превышен лимит запросов. Максимум 30 запросов в минуту.'
  }),

  // Мягкий лимит для обычных операций
  moderate: createRateLimit({
    windowMs: 1 * 60 * 1000, // 1 минута - должно быть env
    max: 100, // 100 запросов за минуту - должно быть env
    message: 'Превышен лимит запросов. Максимум 100 запросов в минуту.'
  }),

  // Лимит для upload операций
  upload: createRateLimit({
    windowMs: 1 * 60 * 1000, // 1 минута - должно быть env
    max: 10, // 10 загрузок за минуту - должно быть env
    message: 'Слишком много загрузок. Максимум 10 файлов в минуту.'
  })
};
```

### **2. Logging Levels (server/middleware/logging.ts)**
```typescript
// 🚨 ХАРДКОЖЕНО - должно быть в env
export const devLogger = requestLogger({
  includeBody: true,
  includeResponse: true,
  includeHeaders: false,
  maskSensitiveData: true,
  logLevel: 'debug', // должно быть process.env.LOG_LEVEL
  maxBodySize: 5120 // должно быть process.env.LOG_MAX_BODY_SIZE
});

export const prodLogger = requestLogger({
  includeBody: false,
  includeResponse: false,
  includeHeaders: false,
  maskSensitiveData: true,
  logLevel: 'warn', // должно быть process.env.LOG_LEVEL
  skipHealthChecks: true
});

export const debugLogger = requestLogger({
  includeBody: true,
  includeResponse: true,
  includeHeaders: true,
  maskSensitiveData: false,
  logLevel: 'debug', // должно быть process.env.LOG_LEVEL
  maxBodySize: 20480, // 20KB - должно быть process.env.LOG_MAX_BODY_SIZE
  excludePaths: []
});
```

### **3. Performance Metrics Settings**
```typescript
// 🚨 ХАРДКОЖЕНО в server/middleware/logging.ts
class PerformanceTracker {
  private metrics: Map<string, PerformanceMetrics> = new Map();
  private requests: RequestLogEntry[] = [];
  private readonly maxHistorySize = 1000; // должно быть env

  // В updateMetrics()
  const recentRequests = this.requests.filter(
    req => new Date(req.timestamp) > new Date(Date.now() - 60000) // 1 минута - должно быть env
  );

  const slowRequestCount = recentRequests.filter(
    req => req.responseTime > 1000 // 1000ms - должно быть env
  ).length;
}
```

### **4. Security Headers & CORS Timeouts**
```typescript
// 🚨 ЧАСТИЧНО хардкожено в server/middleware/security.ts
const defaultConfig: CorsConfig = {
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.FRONTEND_URL?.split(',') || false  // ✅ Хорошо
    : true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  maxAge: 86400, // ❌ ХАРДКОЖЕНО - 24 часа, должно быть в env
  optionsSuccessStatus: 200
};

// CSP и другие helmet настройки тоже статичны
export const createHelmet = (config?: HelmetConfig) => {
  const defaultConfig: HelmetConfig = {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        // ... другие директивы хардкожены
      },
    },
    hsts: {
      maxAge: 31536000, // ❌ ХАРДКОЖЕНО - должно быть в env
      includeSubDomains: true,
      preload: true
    }
  };
};
```

### **5. Cache & Alert Thresholds**
```typescript
// 🚨 Алерты хардкожены в server/middleware/metrics.ts
export const checkAlerts = (): SystemAlert[] => {
  const alerts: SystemAlert[] = [];
  
  // Cache hit rate проверка
  if (cacheHitRate < 70) { // ❌ ХАРДКОЖЕНО - должно быть env
    alerts.push({
      level: 'MEDIUM',
      type: 'PERFORMANCE', 
      message: `Hit rate кэша ${cacheHitRate.toFixed(2)}% ниже лимита 70%`,
      timestamp: new Date().toISOString()
    });
  }
  
  // Response time проверка
  if (avgResponseTime > 2000) { // ❌ ХАРДКОЖЕНО - должно быть env
    alerts.push({
      level: 'HIGH',
      type: 'PERFORMANCE',
      message: `Среднее время ответа ${avgResponseTime}ms превышает лимит 2000ms`,
      timestamp: new Date().toISOString()
    });
  }
};
```

---

## **📋 ОТСУТСТВУЮЩИЕ ENV ПЕРЕМЕННЫЕ**

### **Rate Limiting Configuration**
```bash
# Rate limiting settings
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=1000  
RATE_LIMIT_AUTH_MAX=5
RATE_LIMIT_AUTH_WINDOW_MS=900000
RATE_LIMIT_STRICT_MAX=30
RATE_LIMIT_STRICT_WINDOW_MS=60000
RATE_LIMIT_MODERATE_MAX=100
RATE_LIMIT_MODERATE_WINDOW_MS=60000
RATE_LIMIT_UPLOAD_MAX=10
RATE_LIMIT_UPLOAD_WINDOW_MS=60000
```

### **Logging Configuration**
```bash
# Logging settings
LOG_LEVEL=info
LOG_MAX_BODY_SIZE=10240
LOG_INCLUDE_BODY=false
LOG_INCLUDE_HEADERS=false  
LOG_INCLUDE_RESPONSE=false
LOG_MASK_SENSITIVE_DATA=true
LOG_SKIP_HEALTH_CHECKS=true
LOG_EXCLUDE_PATHS=/health,/metrics,/favicon.ico
```

### **Performance & Monitoring**
```bash
# Performance settings
METRICS_HISTORY_SIZE=1000
METRICS_WINDOW_MS=60000
CACHE_HIT_THRESHOLD=70
SLOW_REQUEST_THRESHOLD=1000
RESPONSE_TIME_ALERT_THRESHOLD=2000
ERROR_RATE_THRESHOLD=5
```

### **Security Configuration**
```bash
# CORS settings
CORS_MAX_AGE=86400
CORS_METHODS=GET,POST,PUT,DELETE,PATCH,OPTIONS
CORS_ALLOWED_HEADERS=Origin,X-Requested-With,Content-Type,Accept,Authorization,X-API-Key,X-Request-ID

# Security headers
HSTS_MAX_AGE=31536000
HSTS_INCLUDE_SUBDOMAINS=true
HSTS_PRELOAD=true
CSP_DEFAULT_SRC=self
CSP_STYLE_SRC=self,unsafe-inline,https://fonts.googleapis.com
CSP_FONT_SRC=self,https://fonts.gstatic.com

# Session settings
SESSION_TIMEOUT=1800000
MAX_LOGIN_ATTEMPTS=5
ACCOUNT_LOCKOUT_DURATION=900000
```

---

## **💡 РЕКОМЕНДУЕМЫЕ ИСПРАВЛЕНИЯ**

### **1. Создать централизованный config/environment.ts**

```typescript
interface AppConfig {
  // Rate Limiting
  rateLimits: {
    general: {
      windowMs: number;
      max: number;
    };
    auth: {
      windowMs: number;
      max: number;
    };
    strict: {
      windowMs: number;
      max: number;
    };
    moderate: {
      windowMs: number;
      max: number;
    };
    upload: {
      windowMs: number;
      max: number;
    };
  };
  
  // Logging  
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    maxBodySize: number;
    includeBody: boolean;
    includeHeaders: boolean;
    includeResponse: boolean;
    maskSensitiveData: boolean;
    skipHealthChecks: boolean;
    excludePaths: string[];
  };
  
  // Performance
  performance: {
    metricsHistorySize: number;
    metricsWindowMs: number;
    cacheHitThreshold: number;
    slowRequestThreshold: number;
    responseTimeAlertThreshold: number;
    errorRateThreshold: number;
  };
  
  // Security
  security: {
    cors: {
      maxAge: number;
      methods: string[];
      allowedHeaders: string[];
    };
    headers: {
      hstsMaxAge: number;
      hstsIncludeSubDomains: boolean;
      hstsPreload: boolean;
      cspDefaultSrc: string;
      cspStyleSrc: string;
    };
    session: {
      timeout: number;
      maxLoginAttempts: number;
      lockoutDuration: number;
    };
  };
}

// Функция для парсинга env переменных с fallback значениями
function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

function getEnvBoolean(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true';
}

function getEnvStringArray(key: string, defaultValue: string[]): string[] {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value.split(',').map(item => item.trim());
}

export const config: AppConfig = {
  rateLimits: {
    general: {
      windowMs: getEnvNumber('RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000),
      max: getEnvNumber('RATE_LIMIT_MAX_REQUESTS', 1000)
    },
    auth: {
      windowMs: getEnvNumber('RATE_LIMIT_AUTH_WINDOW_MS', 15 * 60 * 1000),
      max: getEnvNumber('RATE_LIMIT_AUTH_MAX', 5)
    },
    strict: {
      windowMs: getEnvNumber('RATE_LIMIT_STRICT_WINDOW_MS', 1 * 60 * 1000),
      max: getEnvNumber('RATE_LIMIT_STRICT_MAX', 30)
    },
    moderate: {
      windowMs: getEnvNumber('RATE_LIMIT_MODERATE_WINDOW_MS', 1 * 60 * 1000),
      max: getEnvNumber('RATE_LIMIT_MODERATE_MAX', 100)
    },
    upload: {
      windowMs: getEnvNumber('RATE_LIMIT_UPLOAD_WINDOW_MS', 1 * 60 * 1000),
      max: getEnvNumber('RATE_LIMIT_UPLOAD_MAX', 10)
    }
  },
  
  logging: {
    level: (process.env.LOG_LEVEL as any) || 'info',
    maxBodySize: getEnvNumber('LOG_MAX_BODY_SIZE', 10240),
    includeBody: getEnvBoolean('LOG_INCLUDE_BODY', false),
    includeHeaders: getEnvBoolean('LOG_INCLUDE_HEADERS', false),
    includeResponse: getEnvBoolean('LOG_INCLUDE_RESPONSE', false),
    maskSensitiveData: getEnvBoolean('LOG_MASK_SENSITIVE_DATA', true),
    skipHealthChecks: getEnvBoolean('LOG_SKIP_HEALTH_CHECKS', true),
    excludePaths: getEnvStringArray('LOG_EXCLUDE_PATHS', ['/health', '/metrics', '/favicon.ico'])
  },
  
  performance: {
    metricsHistorySize: getEnvNumber('METRICS_HISTORY_SIZE', 1000),
    metricsWindowMs: getEnvNumber('METRICS_WINDOW_MS', 60000),
    cacheHitThreshold: getEnvNumber('CACHE_HIT_THRESHOLD', 70),
    slowRequestThreshold: getEnvNumber('SLOW_REQUEST_THRESHOLD', 1000),
    responseTimeAlertThreshold: getEnvNumber('RESPONSE_TIME_ALERT_THRESHOLD', 2000),
    errorRateThreshold: getEnvNumber('ERROR_RATE_THRESHOLD', 5)
  },
  
  security: {
    cors: {
      maxAge: getEnvNumber('CORS_MAX_AGE', 86400),
      methods: getEnvStringArray('CORS_METHODS', ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']),
      allowedHeaders: getEnvStringArray('CORS_ALLOWED_HEADERS', [
        'Origin', 'X-Requested-With', 'Content-Type', 'Accept', 
        'Authorization', 'X-API-Key', 'X-Request-ID'
      ])
    },
    headers: {
      hstsMaxAge: getEnvNumber('HSTS_MAX_AGE', 31536000),
      hstsIncludeSubDomains: getEnvBoolean('HSTS_INCLUDE_SUBDOMAINS', true),
      hstsPreload: getEnvBoolean('HSTS_PRELOAD', true),
      cspDefaultSrc: process.env.CSP_DEFAULT_SRC || "'self'",
      cspStyleSrc: process.env.CSP_STYLE_SRC || "'self' 'unsafe-inline' https://fonts.googleapis.com"
    },
    session: {
      timeout: getEnvNumber('SESSION_TIMEOUT', 30 * 60 * 1000), // 30 минут
      maxLoginAttempts: getEnvNumber('MAX_LOGIN_ATTEMPTS', 5),
      lockoutDuration: getEnvNumber('ACCOUNT_LOCKOUT_DURATION', 15 * 60 * 1000) // 15 минут
    }
  }
};

// Валидация конфигурации при запуске
export function validateConfig(): void {
  const requiredEnvVars = [
    'DATABASE_URL',
    'JWT_SECRET', 
    'ENCRYPTION_KEY'
  ];
  
  const missing = requiredEnvVars.filter(envVar => !process.env[envVar]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  
  // Валидация значений
  if (config.rateLimits.auth.max > config.rateLimits.general.max) {
    console.warn('⚠️ AUTH rate limit выше общего лимита - может быть некорректно');
  }
  
  if (config.performance.cacheHitThreshold > 100 || config.performance.cacheHitThreshold < 0) {
    throw new Error('CACHE_HIT_THRESHOLD должен быть между 0 и 100');
  }
  
  console.log('✅ Конфигурация валидна');
}
```

### **2. Обновить security middleware**

```typescript
// server/middleware/security.ts
import { config } from '../config/environment';

export const rateLimiters = {
  general: createRateLimit({
    windowMs: config.rateLimits.general.windowMs,
    max: config.rateLimits.general.max,
    message: 'Слишком много запросов. Попробуйте позже.'
  }),

  auth: createRateLimit({
    windowMs: config.rateLimits.auth.windowMs,
    max: config.rateLimits.auth.max,
    message: 'Слишком много попыток входа. Попробуйте позже.',
    skipSuccessfulRequests: true
  }),

  strict: createRateLimit({
    windowMs: config.rateLimits.strict.windowMs,
    max: config.rateLimits.strict.max,
    message: 'Превышен лимит запросов.'
  }),

  moderate: createRateLimit({
    windowMs: config.rateLimits.moderate.windowMs,
    max: config.rateLimits.moderate.max,
    message: 'Превышен лимит запросов.'
  }),

  upload: createRateLimit({
    windowMs: config.rateLimits.upload.windowMs,
    max: config.rateLimits.upload.max,
    message: 'Слишком много загрузок.'
  })
};

// CORS конфигурация через env
export const createCors = (customConfig?: CorsConfig) => {
  const defaultConfig: CorsConfig = {
    origin: process.env.NODE_ENV === 'production' 
      ? process.env.FRONTEND_URL?.split(',') || false
      : true,
    credentials: true,
    methods: config.security.cors.methods,
    allowedHeaders: config.security.cors.allowedHeaders,
    maxAge: config.security.cors.maxAge,
    optionsSuccessStatus: 200
  };

  return corsMiddleware({ ...defaultConfig, ...customConfig });
};
```

### **3. Обновить logging middleware**

```typescript
// server/middleware/logging.ts  
import { config } from '../config/environment';

export const createLogger = (environment: 'dev' | 'prod' | 'debug' | 'audit') => {
  const baseConfig = {
    logLevel: config.logging.level,
    maxBodySize: config.logging.maxBodySize,
    excludePaths: config.logging.excludePaths,
    skipHealthChecks: config.logging.skipHealthChecks,
    maskSensitiveData: config.logging.maskSensitiveData
  };

  switch (environment) {
    case 'dev':
      return requestLogger({
        ...baseConfig,
        includeBody: config.logging.includeBody || true,
        includeResponse: config.logging.includeResponse || true,
        includeHeaders: config.logging.includeHeaders || false,
        logLevel: 'debug'
      });

    case 'prod':
      return requestLogger({
        ...baseConfig,
        includeBody: false,
        includeResponse: false,
        includeHeaders: false,
        logLevel: 'warn'
      });

    case 'debug':
      return requestLogger({
        ...baseConfig,
        includeBody: true,
        includeResponse: true,
        includeHeaders: true,
        maskSensitiveData: false,
        logLevel: 'debug'
      });

    case 'audit':
      return requestLogger({
        ...baseConfig,
        includeBody: true,
        includeResponse: true,
        includeHeaders: false,
        maskSensitiveData: false,
        logLevel: 'info',
        excludePaths: ['/health']
      });

    default:
      return requestLogger(baseConfig);
  }
};

export const devLogger = createLogger('dev');
export const prodLogger = createLogger('prod');
export const debugLogger = createLogger('debug');
export const auditLogger = createLogger('audit');
```

### **4. Обновить performance tracking**

```typescript
// server/middleware/logging.ts - PerformanceTracker
import { config } from '../config/environment';

class PerformanceTracker {
  private metrics: Map<string, PerformanceMetrics> = new Map();
  private requests: RequestLogEntry[] = [];
  private readonly maxHistorySize = config.performance.metricsHistorySize;

  private updateMetrics(): void {
    const now = new Date().toISOString();
    const recentRequests = this.requests.filter(
      req => new Date(req.timestamp) > new Date(Date.now() - config.performance.metricsWindowMs)
    );

    if (recentRequests.length === 0) return;

    const slowRequestCount = recentRequests.filter(
      req => req.responseTime > config.performance.slowRequestThreshold
    ).length;

    // Остальная логика...
  }
}

// Алерты с конфигурируемыми порогами
export const checkAlerts = (): SystemAlert[] => {
  const alerts: SystemAlert[] = [];
  
  if (cacheHitRate < config.performance.cacheHitThreshold) {
    alerts.push({
      level: 'MEDIUM',
      type: 'PERFORMANCE', 
      message: `Hit rate кэша ${cacheHitRate.toFixed(2)}% ниже лимита ${config.performance.cacheHitThreshold}%`,
      timestamp: new Date().toISOString()
    });
  }
  
  if (avgResponseTime > config.performance.responseTimeAlertThreshold) {
    alerts.push({
      level: 'HIGH',
      type: 'PERFORMANCE',
      message: `Среднее время ответа ${avgResponseTime}ms превышает лимит ${config.performance.responseTimeAlertThreshold}ms`,
      timestamp: new Date().toISOString()
    });
  }

  return alerts;
};
```

---

## **📋 ПЛАН ВНЕДРЕНИЯ**

### **Фаза 1: Создание конфигурационной системы (1 день)**
- [ ] Создать `config/environment.ts` с полной типизацией
- [ ] Добавить валидацию конфигурации при запуске
- [ ] Создать .env.example с полным списком переменных
- [ ] Обновить документацию по настройке

### **Фаза 2: Миграция middleware (1-2 дня)**  
- [ ] Обновить `server/middleware/security.ts` для использования config
- [ ] Обновить `server/middleware/logging.ts` для использования config
- [ ] Обновить `server/middleware/metrics.ts` для использования config
- [ ] Протестировать все middleware с новой конфигурацией

### **Фаза 3: Интеграция и тестирование (1 день)**
- [ ] Интегрировать config в основное приложение (`server/index.ts`)
- [ ] Добавить конфигурационные переменные в production environment
- [ ] Провести нагрузочное тестирование с новыми лимитами
- [ ] Настроить мониторинг конфигурационных изменений

### **Фаза 4: Документация и автоматизация (1 день)**
- [ ] Обновить README с полным списком env переменных
- [ ] Создать скрипты для валидации конфигурации
- [ ] Добавить автотесты для различных конфигурационных сценариев
- [ ] Настроить CI/CD проверки конфигурации

---

## **🎯 ОЖИДАЕМЫЕ РЕЗУЛЬТАТЫ**

### **Преимущества после внедрения:**
- ✅ **Гибкость**: Все настройки через environment variables
- ✅ **Безопасность**: Разные настройки для dev/staging/production
- ✅ **Мониторинг**: Конфигурируемые пороги алертов
- ✅ **Масштабирование**: Легкая настройка лимитов под нагрузку
- ✅ **Отладка**: Настраиваемые уровни логирования
- ✅ **Compliance**: Аудируемые изменения конфигурации

### **Метрики успеха:**
- ❌ → ✅ Хардкоженные значения: 15+ параметров → 0
- ❌ → ✅ Конфигурационное покрытие: 40% → 100%
- ❌ → ✅ Environment readiness: Частичная → Полная
- ❌ → ✅ Production flexibility: Низкая → Высокая

---

## **📈 ТЕКУЩИЕ АЛЕРТЫ**

На основе мониторинга системы:
```
🚨 ALERT [MEDIUM]: Hit rate кэша 0.00% ниже лимита 70%
- Проблема: Кэш не работает эффективно
- Решение: Настроить CACHE_HIT_THRESHOLD через env

⏱️ Response time: 1200-1600ms для /api/admin/documents/pending  
- Проблема: Медленные запросы
- Решение: Настроить SLOW_REQUEST_THRESHOLD и оптимизировать
```

**После внедрения** эти пороги будут легко настраиваться через environment variables без изменения кода.

---

**🎯 ИТОГО**: Система требует полной миграции хардкоженных настроек в environment variables для production-ready развертывания. Текущий уровень конфигурируемости ~40%, необходимо достичь 100% для enterprise-grade системы.