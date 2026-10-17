import { Request, Response, NextFunction } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import helmet from 'helmet';
import { 
  AsyncMiddleware, 
  ErrorCodes,
  HttpStatus,
  RequestLogEntry
} from './types';
import { AppError, asyncHandler } from './errorHandler';
import { config } from '../../config/environment';

// ===========================================
// SECURITY MIDDLEWARE СИСТЕМА
// ===========================================

/**
 * Конфигурация rate limiting
 */
export interface RateLimitConfig {
  windowMs: number; // время окна в миллисекундах
  max: number; // максимум запросов за окно
  message?: string; // кастомное сообщение
  standardHeaders?: boolean; // отправлять rate limit info в headers
  legacyHeaders?: boolean; // поддержка старых headers
  skipSuccessfulRequests?: boolean; // не считать успешные запросы
  skipFailedRequests?: boolean; // не считать неудачные запросы
  keyGenerator?: (req: Request) => string; // функция генерации ключа
  skip?: (req: Request) => boolean; // функция пропуска
}

/**
 * Конфигурация CORS
 */
export interface CorsMiddlewareConfig {
  origin?: string | string[] | boolean | ((origin: string | undefined, callback: Function) => void);
  credentials?: boolean;
  methods?: string[];
  allowedHeaders?: string[];
  exposedHeaders?: string[];
  maxAge?: number;
  preflightContinue?: boolean;
  optionsSuccessStatus?: number;
}

/**
 * Конфигурация Helmet (безопасность headers)
 */
export interface HelmetMiddlewareConfig {
  contentSecurityPolicy?: boolean | object;
  crossOriginEmbedderPolicy?: boolean | object;
  crossOriginOpenerPolicy?: boolean | object;
  crossOriginResourcePolicy?: boolean | object;
  dnsPrefetchControl?: boolean | object;
  frameguard?: boolean | object;
  hidePoweredBy?: boolean | object;
  hsts?: boolean | object;
  ieNoOpen?: boolean | object;
  noSniff?: boolean | object;
  originAgentCluster?: boolean | object;
  permittedCrossDomainPolicies?: boolean | object;
  referrerPolicy?: boolean | object;
  xssFilter?: boolean | object;
}

// ===========================================
// RATE LIMITING MIDDLEWARE
// ===========================================

/**
 * Создание rate limiter с конфигурацией
 */
export const createRateLimit = (config: RateLimitConfig) => {
  return rateLimit({
    windowMs: config.windowMs,
    max: config.max,
    message: {
      error: config.message || 'Слишком много запросов. Попробуйте позже.',
      errorCode: ErrorCodes.TOO_MANY_REQUESTS,
      retryAfter: Math.ceil(config.windowMs / 1000)
    },
    standardHeaders: config.standardHeaders ?? true,
    legacyHeaders: config.legacyHeaders ?? false,
    skipSuccessfulRequests: config.skipSuccessfulRequests ?? false,
    skipFailedRequests: config.skipFailedRequests ?? false,
    keyGenerator: config.keyGenerator || ((req: Request) => ipKeyGenerator(req.ip || 'unknown')), // Исправлено: IPv6 безопасный generator
    skip: config.skip || (() => false),
    handler: (req: Request, res: Response) => {
      const retryAfter = Math.ceil(config.windowMs / 1000);
      res.status(HttpStatus.TOO_MANY_REQUESTS).json({
        success: false,
        // Формы читают текст ошибки из message
        message: config.message || 'Слишком много запросов. Попробуйте позже.',
        error: {
          message: config.message || 'Слишком много запросов. Попробуйте позже.',
          errorCode: ErrorCodes.TOO_MANY_REQUESTS,
          status: HttpStatus.TOO_MANY_REQUESTS,
          retryAfter,
          timestamp: new Date().toISOString(),
          path: req.path,
          method: req.method
        }
      });
    }
  });
};

/**
 * Предустановленные rate limiters (из конфигурации)
 */
export const rateLimiters = {
  // Общий лимит для API
  general: createRateLimit({
    windowMs: config.rateLimits.general.windowMs,
    max: config.rateLimits.general.max,
    message: `Слишком много запросов. Максимум ${config.rateLimits.general.max} запросов за ${config.rateLimits.general.windowMs/60000} минут.`
  }),

  // Строгий лимит для auth endpoints
  auth: createRateLimit({
    windowMs: config.rateLimits.auth.windowMs,
    max: config.rateLimits.auth.max,
    message: `Слишком много попыток входа. Попробуйте через ${config.rateLimits.auth.windowMs/60000} минут.`,
    skipSuccessfulRequests: true,
    // У восстановления пароля свои лимиты: неудачные входы не должны закрывать и его
    skip: (req: Request) => req.path.startsWith('/password/'),
  }),

  // Лимит для API с высокой нагрузкой
  strict: createRateLimit({
    windowMs: config.rateLimits.strict.windowMs,
    max: config.rateLimits.strict.max,
    message: `Превышен лимит запросов. Максимум ${config.rateLimits.strict.max} запросов за ${config.rateLimits.strict.windowMs/60000} минут.`
  }),

  // Мягкий лимит для обычных операций
  moderate: createRateLimit({
    windowMs: config.rateLimits.moderate.windowMs,
    max: config.rateLimits.moderate.max,
    message: `Превышен лимит запросов. Максимум ${config.rateLimits.moderate.max} запросов за ${config.rateLimits.moderate.windowMs/60000} минут.`
  }),

  // Лимит для upload операций
  upload: createRateLimit({
    windowMs: config.rateLimits.upload.windowMs,
    max: config.rateLimits.upload.max,
    message: `Слишком много загрузок. Максимум ${config.rateLimits.upload.max} файлов за ${config.rateLimits.upload.windowMs/60000} минут.`
  })
};

// ===========================================
// CORS MIDDLEWARE
// ===========================================

/**
 * Создание CORS middleware с конфигурацией
 */
export const createCors = (corsConfig?: CorsMiddlewareConfig) => {
  const defaultConfig: CorsMiddlewareConfig = {
    origin: config.env === 'production' 
      ? config.frontend.urls
      : true, // в dev режиме разрешаем все
    credentials: true,
    methods: config.security.cors.methods,
    allowedHeaders: config.security.cors.allowedHeaders,
    exposedHeaders: config.security.cors.exposedHeaders,
    maxAge: config.security.cors.maxAge,
    optionsSuccessStatus: 200
  };

  // Простая реализация CORS middleware
  return (req: Request, res: Response, next: NextFunction) => {
    const mergedConfig = { ...defaultConfig, ...corsConfig };
    
    // Установка CORS headers
    if (mergedConfig.origin === true) {
      res.header('Access-Control-Allow-Origin', '*');
    } else if (typeof mergedConfig.origin === 'string') {
      res.header('Access-Control-Allow-Origin', mergedConfig.origin);
    } else if (Array.isArray(mergedConfig.origin)) {
      const requestOrigin = req.header('Origin');
      if (requestOrigin && mergedConfig.origin.includes(requestOrigin)) {
        res.header('Access-Control-Allow-Origin', requestOrigin);
      }
    }

    if (mergedConfig.credentials) {
      res.header('Access-Control-Allow-Credentials', 'true');
    }

    if (mergedConfig.methods) {
      res.header('Access-Control-Allow-Methods', mergedConfig.methods.join(', '));
    }

    if (mergedConfig.allowedHeaders) {
      res.header('Access-Control-Allow-Headers', mergedConfig.allowedHeaders.join(', '));
    }

    if (mergedConfig.exposedHeaders) {
      res.header('Access-Control-Expose-Headers', mergedConfig.exposedHeaders.join(', '));
    }

    if (mergedConfig.maxAge) {
      res.header('Access-Control-Max-Age', mergedConfig.maxAge.toString());
    }

    // Обработка preflight OPTIONS запросов
    if (req.method === 'OPTIONS') {
      return res.status(mergedConfig.optionsSuccessStatus || 200).end();
    }

    next();
  };
};

// ===========================================
// HELMET MIDDLEWARE (Security Headers)
// ===========================================

/**
 * Создание Helmet middleware с конфигурацией
 */
export const createHelmet = (helmetConfig?: HelmetMiddlewareConfig) => {
  const defaultConfig = {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: config.security.headers.cspDefaultSrc.split(' '),
        styleSrc: config.security.headers.cspStyleSrc.split(' '),
        fontSrc: config.security.headers.cspFontSrc.split(' '),
        imgSrc: config.security.headers.cspImgSrc.split(' '),
        scriptSrc: config.security.headers.cspScriptSrc.split(' '),
        connectSrc: ["'self'", "https://api.openai.com", "https://api.sberbank.ru"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    crossOriginEmbedderPolicy: false, // отключено для совместимости
    hsts: {
      maxAge: config.security.headers.hstsMaxAge,
      includeSubDomains: config.security.headers.hstsIncludeSubDomains,
      preload: config.security.headers.hstsPreload
    },
    noSniff: true,
    frameguard: { action: 'deny' as const },
    xssFilter: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' as const }
  };

  return helmet(defaultConfig);
};

// ===========================================
// IP & GEOGRAPHIC RESTRICTIONS
// ===========================================

/**
 * Блокировка IP адресов
 */
export const blockIPs = (blockedIPs: string[]) => {
  return asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const clientIP = req.ip || req.connection.remoteAddress || '';
    
    if (blockedIPs.includes(clientIP)) {
      throw new AppError(
        'Доступ запрещен с данного IP адреса',
        ErrorCodes.ACCESS_DENIED,
        HttpStatus.FORBIDDEN
      );
    }

    next();
  });
};

/**
 * Разрешение только определенных IP адресов
 */
export const allowOnlyIPs = (allowedIPs: string[]) => {
  return asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const clientIP = req.ip || req.connection.remoteAddress || '';
    
    if (!allowedIPs.includes(clientIP)) {
      throw new AppError(
        'Доступ разрешен только с авторизованных IP адресов',
        ErrorCodes.ACCESS_DENIED,
        HttpStatus.FORBIDDEN
      );
    }

    next();
  });
};

/**
 * Проверка User-Agent для блокировки ботов
 */
export const blockBots = (options: {
  blockedUserAgents?: string[];
  allowOnlyBrowsers?: boolean;
  requireUserAgent?: boolean;
} = {}) => {
  const { 
    blockedUserAgents = [],
    allowOnlyBrowsers = false,
    requireUserAgent = true 
  } = options;

  const botPatterns = [
    /bot/i, /spider/i, /crawler/i, /scraper/i, /harvester/i,
    /curl/i, /wget/i, /python/i, /java/i, /php/i
  ];

  const browserPatterns = [
    /Mozilla/i, /Chrome/i, /Safari/i, /Firefox/i, /Edge/i, /Opera/i
  ];

  return asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const userAgent = req.get('user-agent') || '';

    // Проверка обязательности User-Agent
    if (requireUserAgent && !userAgent) {
      throw new AppError(
        'User-Agent header обязателен',
        ErrorCodes.VALIDATION_ERROR,
        HttpStatus.BAD_REQUEST
      );
    }

    // Проверка заблокированных User-Agent
    if (blockedUserAgents.some(blocked => userAgent.includes(blocked))) {
      throw new AppError(
        'Доступ запрещен для данного User-Agent',
        ErrorCodes.ACCESS_DENIED,
        HttpStatus.FORBIDDEN
      );
    }

    // Проверка ботов
    if (botPatterns.some(pattern => pattern.test(userAgent))) {
      throw new AppError(
        'Доступ запрещен для автоматических запросов',
        ErrorCodes.ACCESS_DENIED,
        HttpStatus.FORBIDDEN
      );
    }

    // Проверка браузеров (если включено)
    if (allowOnlyBrowsers && !browserPatterns.some(pattern => pattern.test(userAgent))) {
      throw new AppError(
        'Доступ разрешен только из браузеров',
        ErrorCodes.ACCESS_DENIED,
        HttpStatus.FORBIDDEN
      );
    }

    next();
  });
};

// ===========================================
// COMPOSITE SECURITY MIDDLEWARE
// ===========================================

/**
 * Базовая безопасность для всех routes
 */
export const basicSecurity = [
  createHelmet(),
  createCors()
];

/**
 * Усиленная безопасность для критичных endpoints
 */
export const strictSecurity = [
  createHelmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'none'"],
        frameSrc: ["'none'"],
      },
    },
  }),
  createCors({
    origin: false, // блокируем все cross-origin запросы
    credentials: false
  }),
  rateLimiters.strict,
  blockBots({ allowOnlyBrowsers: true })
];

/**
 * Middleware для API endpoints
 */
export const apiSecurity = [
  createHelmet({
    contentSecurityPolicy: false // отключаем CSP для API
  }),
  createCors({
    origin: config.env === 'production' ? config.frontend.urls : true
  }),
  rateLimiters.moderate
];

/**
 * Middleware для публичных endpoints
 */
export const publicSecurity = [
  createHelmet(),
  createCors(),
  rateLimiters.general
];

// ===========================================
// MONITORING & ANALYTICS
// ===========================================

/**
 * Сбор метрик безопасности
 */
export const securityMetrics = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    
    // Логируем подозрительную активность
    const suspiciousPatterns = [
      /\.\./,  // path traversal
      /<script/i, // XSS attempts  
      /union.*select/i, // SQL injection
      /exec|eval|system/i, // code injection
    ];

    const fullUrl = req.originalUrl || req.url;
    const userAgent = req.get('user-agent') || '';
    
    if (suspiciousPatterns.some(pattern => 
      pattern.test(fullUrl) || pattern.test(userAgent)
    )) {
      console.warn('🚨 Подозрительная активность:', {
        ip: req.ip,
        userAgent,
        url: fullUrl,
        timestamp: new Date().toISOString()
      });
    }

    // Продолжаем обработку
    res.on('finish', () => {
      const responseTime = Date.now() - startTime;
      
      // Логируем медленные запросы (из конфига)
      if (responseTime > config.performance.slowRequestThreshold) {
        console.warn('🐌 Медленный запрос:', {
          method: req.method,
          url: fullUrl,
          responseTime: `${responseTime}ms`,
          statusCode: res.statusCode,
          threshold: `${config.performance.slowRequestThreshold}ms`
        });
      }
    });

    next();
  }
);