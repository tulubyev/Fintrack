import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema, ZodError } from 'zod';
import { 
  AsyncMiddleware, 
  ValidationErrorDetail, 
  ValidationResult,
  ErrorCodes,
  HttpStatus 
} from './types';
import { ValidationError, asyncHandler } from './errorHandler';

// ===========================================
// VALIDATION MIDDLEWARE СИСТЕМА
// ===========================================

/**
 * Типы данных для валидации
 */
export type ValidationTarget = 'body' | 'params' | 'query' | 'headers';

/**
 * Конфигурация валидации
 */
export interface ValidationConfig {
  body?: ZodSchema;
  params?: ZodSchema;
  query?: ZodSchema;
  headers?: ZodSchema;
  // Опции валидации
  strict?: boolean; // строгая валидация (не разрешать дополнительные поля)
  skipValidation?: (req: Request) => boolean; // условие пропуска валидации
  customErrorMessage?: string; // кастомное сообщение об ошибке
}

/**
 * Результат валидации с типизированными данными
 */
export interface TypedRequest<
  TBody = any,
  TParams = any,
  TQuery = any,
  THeaders = any
> extends Request {
  body: TBody;
  params: TParams & Record<string, string>;
  query: TQuery & Record<string, any>;
  headers: THeaders & Request['headers'];
  validatedData: {
    body?: TBody;
    params?: TParams;
    query?: TQuery;
    headers?: THeaders;
  };
}

// ===========================================
// CORE VALIDATION ФУНКЦИИ
// ===========================================

/**
 * Валидация одного объекта с Zod схемой
 */
function validateData<T>(
  data: unknown, 
  schema: ZodSchema<T>, 
  target: ValidationTarget
): ValidationResult {
  try {
    const validatedData = schema.parse(data);
    return {
      isValid: true,
      errors: [],
      data: validatedData
    };
  } catch (error) {
    if (error instanceof ZodError) {
      const errors: ValidationErrorDetail[] = error.errors.map(err => ({
        field: `${target}.${err.path.join('.')}`,
        message: err.message,
        value: (err as any).received || 'unknown',
        code: err.code
      }));

      return {
        isValid: false,
        errors,
        data: null
      };
    }

    return {
      isValid: false,
      errors: [{
        field: target,
        message: 'Неизвестная ошибка валидации',
        code: 'UNKNOWN_ERROR'
      }],
      data: null
    };
  }
}

/**
 * Основной validation middleware
 */
export const validate = (config: ValidationConfig): AsyncMiddleware => {
  return asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    // Проверка условия пропуска валидации
    if (config.skipValidation && config.skipValidation(req)) {
      return next();
    }

    const validationErrors: ValidationErrorDetail[] = [];
    const validatedData: any = {};

    // Валидация body
    if (config.body) {
      const result = validateData(req.body, config.body, 'body');
      if (!result.isValid) {
        validationErrors.push(...result.errors);
      } else {
        req.body = result.data;
        validatedData.body = result.data;
      }
    }

    // Валидация params
    if (config.params) {
      const result = validateData(req.params, config.params, 'params');
      if (!result.isValid) {
        validationErrors.push(...result.errors);
      } else {
        req.params = result.data;
        validatedData.params = result.data;
      }
    }

    // Валидация query
    if (config.query) {
      const result = validateData(req.query, config.query, 'query');
      if (!result.isValid) {
        validationErrors.push(...result.errors);
      } else {
        req.query = result.data;
        validatedData.query = result.data;
      }
    }

    // Валидация headers
    if (config.headers) {
      const result = validateData(req.headers, config.headers, 'headers');
      if (!result.isValid) {
        validationErrors.push(...result.errors);
      } else {
        validatedData.headers = result.data;
      }
    }

    // Если есть ошибки валидации - бросаем исключение
    if (validationErrors.length > 0) {
      const message = config.customErrorMessage || 
        `Ошибка валидации: ${validationErrors.map(e => `${e.field} - ${e.message}`).join(', ')}`;
      
      throw new ValidationError(message, validationErrors);
    }

    // Добавляем валидированные данные в request
    (req as any).validatedData = validatedData;

    next();
  });
};

// ===========================================
// СПЕЦИАЛИЗИРОВАННЫЕ VALIDATION MIDDLEWARE
// ===========================================

/**
 * Валидация только body с типизацией
 */
export const validateBody = <T>(schema: ZodSchema<T>) => 
  validate({ body: schema });

/**
 * Валидация только params с типизацией
 */
export const validateParams = <T>(schema: ZodSchema<T>) => 
  validate({ params: schema });

/**
 * Валидация только query с типизацией  
 */
export const validateQuery = <T>(schema: ZodSchema<T>) => 
  validate({ query: schema });

/**
 * Валидация только headers
 */
export const validateHeaders = <T>(schema: ZodSchema<T>) => 
  validate({ headers: schema });

// ===========================================
// ГОТОВЫЕ ZOD СХЕМЫ ДЛЯ ЧАСТЫХ СЛУЧАЕВ
// ===========================================

/**
 * Схема для ID параметров
 */
export const idParamsSchema = z.object({
  id: z.string().uuid('ID должен быть валидным UUID')
});

/**
 * Схема для пагинации в query
 */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1, 'Страница должна быть положительным числом').default(1),
  limit: z.coerce.number().int().min(1).max(100, 'Лимит не может превышать 100').default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  search: z.string().optional()
});

/**
 * Схема для фильтрации по дате
 */
export const dateRangeQuerySchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  dateField: z.string().default('createdAt')
}).refine(
  data => !data.startDate || !data.endDate || data.startDate <= data.endDate,
  { message: 'Дата начала не может быть больше даты окончания' }
);

/**
 * Схема для API ключей в headers
 */
export const apiKeyHeaderSchema = z.object({
  'x-api-key': z.string().min(10, 'API ключ должен содержать минимум 10 символов'),
  'user-agent': z.string().optional()
});

/**
 * Схема для авторизации в headers
 */
export const authHeaderSchema = z.object({
  authorization: z.string().regex(
    /^Bearer\s+[\w-]*\.[\w-]*\.[\w-]*$/,
    'Неверный формат Authorization header. Ожидается: Bearer <token>'
  )
});

// ===========================================
// HELPER ФУНКЦИИ
// ===========================================

/**
 * Создание middleware для валидации файлов upload
 */
export const validateFile = (options: {
  required?: boolean;
  maxSize?: number; // в байтах
  allowedTypes?: string[]; // MIME types
  maxCount?: number;
}) => {
  return asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const files = (req as any).files || (req as any).file;
    
    if (options.required && !files) {
      throw new ValidationError('Файл обязателен для загрузки');
    }

    if (!files) {
      return next();
    }

    const fileArray = Array.isArray(files) ? files : [files];

    // Проверка количества файлов
    if (options.maxCount && fileArray.length > options.maxCount) {
      throw new ValidationError(`Превышено максимальное количество файлов: ${options.maxCount}`);
    }

    // Проверка каждого файла
    for (const file of fileArray) {
      // Проверка размера
      if (options.maxSize && file.size > options.maxSize) {
        throw new ValidationError(`Размер файла ${file.name} превышает лимит: ${options.maxSize} байт`);
      }

      // Проверка типа
      if (options.allowedTypes && !options.allowedTypes.includes(file.mimetype)) {
        throw new ValidationError(
          `Неподдерживаемый тип файла ${file.name}: ${file.mimetype}. ` +
          `Разрешены: ${options.allowedTypes.join(', ')}`
        );
      }
    }

    next();
  });
};

/**
 * Conditional валидация - валидирует только если условие выполнено
 */
export const validateConditional = (
  condition: (req: Request) => boolean,
  config: ValidationConfig
) => {
  return validate({
    ...config,
    skipValidation: (req) => !condition(req)
  });
};

/**
 * Валидация с трансформацией данных
 */
export const validateAndTransform = <TInput, TOutput>(
  schema: ZodSchema<TOutput>,
  target: ValidationTarget = 'body'
) => {
  return asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const config: ValidationConfig = {};
    config[target] = schema;
    
    const middleware = validate(config);
    await middleware(req, res, next);
  });
};

// ===========================================
// BATCH VALIDATION
// ===========================================

/**
 * Валидация массива объектов
 */
export const validateArray = <T>(
  itemSchema: ZodSchema<T>,
  options: {
    minItems?: number;
    maxItems?: number;
    target?: ValidationTarget;
  } = {}
) => {
  const { minItems = 0, maxItems = 1000, target = 'body' } = options;
  
  const arraySchema = z.array(itemSchema)
    .min(minItems, `Минимум ${minItems} элементов`)
    .max(maxItems, `Максимум ${maxItems} элементов`);

  const config: ValidationConfig = {};
  config[target] = arraySchema;
  
  return validate(config);
};

/**
 * Экспорт типизированного middleware для использования в роутерах
 */
export type ValidatedMiddleware<
  TBody = any,
  TParams = any, 
  TQuery = any,
  THeaders = any
> = AsyncMiddleware<TypedRequest<TBody, TParams, TQuery, THeaders>>;