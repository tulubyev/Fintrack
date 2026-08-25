import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { ApiError, ErrorCodes, HttpStatus, ApiResponse } from './types';

// ===========================================
// ЦЕНТРАЛИЗОВАННЫЙ ERROR HANDLER
// ===========================================

/**
 * Класс для создания стандартизированных API ошибок
 */
export class AppError extends Error {
  public readonly status: number;
  public readonly errorCode: string;
  public readonly isOperational: boolean;
  public readonly details?: any;

  constructor(
    message: string,
    errorCode: string = ErrorCodes.INTERNAL_SERVER_ERROR,
    status: number = HttpStatus.INTERNAL_SERVER_ERROR,
    isOperational: boolean = true,
    details?: any
  ) {
    super(message);
    this.status = status;
    this.errorCode = errorCode;
    this.isOperational = isOperational;
    this.details = details;

    Error.captureStackTrace(this, this.constructor);
    Object.setPrototypeOf(this, AppError.prototype);
  }

  /**
   * Создать ApiError объект для ответа
   */
  toApiError(req: Request): ApiError {
    return {
      message: this.message,
      errorCode: this.errorCode,
      status: this.status,
      details: this.details,
      timestamp: new Date().toISOString(),
      path: req.path,
      method: req.method
    };
  }
}

// ===========================================
// ПРЕДОПРЕДЕЛЕННЫЕ ОШИБКИ
// ===========================================

export class AuthenticationError extends AppError {
  constructor(message: string = 'Требуется аутентификация', errorCode: string = ErrorCodes.TOKEN_MISSING) {
    super(message, errorCode, HttpStatus.UNAUTHORIZED);
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Доступ запрещен', errorCode: string = ErrorCodes.ACCESS_DENIED) {
    super(message, errorCode, HttpStatus.FORBIDDEN);
  }
}

export class ValidationError extends AppError {
  constructor(message: string = 'Ошибка валидации данных', details?: any) {
    super(message, ErrorCodes.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, true, details);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Ресурс не найден') {
    super(message, ErrorCodes.RESOURCE_NOT_FOUND, HttpStatus.NOT_FOUND);
  }
}

export class ConflictError extends AppError {
  constructor(message: string = 'Конфликт данных') {
    super(message, ErrorCodes.DUPLICATE_RESOURCE, HttpStatus.CONFLICT);
  }
}

export class DatabaseError extends AppError {
  constructor(message: string = 'Ошибка базы данных', details?: any) {
    super(message, ErrorCodes.DATABASE_ERROR, HttpStatus.INTERNAL_SERVER_ERROR, true, details);
  }
}

// ===========================================
// UTILITY ФУНКЦИИ
// ===========================================

/**
 * Обработка Zod ошибок валидации
 */
function handleZodError(error: ZodError): ValidationError {
  const details = error.errors.map(err => ({
    field: err.path.join('.'),
    message: err.message,
    value: (err as any).received || 'unknown',
    code: err.code
  }));

  const message = `Ошибка валидации: ${details.map(d => `${d.field} - ${d.message}`).join(', ')}`;
  return new ValidationError(message, details);
}

/**
 * Обработка JWT ошибок
 */
function handleJWTError(error: Error): AuthenticationError {
  if (error.message.includes('expired')) {
    return new AuthenticationError('Токен истек', ErrorCodes.TOKEN_EXPIRED);
  }
  if (error.message.includes('malformed')) {
    return new AuthenticationError('Недействительный формат токена', ErrorCodes.TOKEN_MALFORMED);
  }
  if (error.message.includes('invalid')) {
    return new AuthenticationError('Недействительный токен', ErrorCodes.TOKEN_INVALID);
  }
  return new AuthenticationError('Ошибка аутентификации', ErrorCodes.TOKEN_INVALID);
}

/**
 * Обработка ошибок базы данных
 */
function handleDatabaseError(error: any): DatabaseError {
  // PostgreSQL error codes
  if (error.code === '23505') { // unique_violation
    return new ConflictError('Ресурс уже существует');
  }
  if (error.code === '23503') { // foreign_key_violation
    return new ValidationError('Ссылочная целостность нарушена');
  }
  if (error.code === '23502') { // not_null_violation
    return new ValidationError('Обязательное поле отсутствует');
  }

  return new DatabaseError('Ошибка базы данных', {
    code: error.code,
    detail: error.detail
  });
}

/**
 * Логирование ошибки
 */
function logError(error: Error, req: Request): void {
  const logData = {
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    userAgent: req.get('user-agent'),
    ip: req.ip,
    userId: (req as any).user?.id,
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
      ...(error instanceof AppError && {
        errorCode: error.errorCode,
        status: error.status,
        details: error.details
      })
    }
  };

  console.error('API Error:', JSON.stringify(logData, null, 2));
}

// ===========================================
// ГЛАВНЫЙ ERROR HANDLER MIDDLEWARE
// ===========================================

/**
 * Централизованный обработчик ошибок
 * Должен быть последним middleware в цепочке
 */
export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Если headers уже отправлены, передаем в Express default handler
  if (res.headersSent) {
    return next(error);
  }

  let appError: AppError;

  // Определяем тип ошибки и конвертируем в AppError
  if (error instanceof AppError) {
    appError = error;
  } else if (error instanceof ZodError) {
    appError = handleZodError(error);
  } else if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
    appError = handleJWTError(error);
  } else if (error.name === 'MongoError' || error.name === 'PostgresError' || 
             (error as any).code && typeof (error as any).code === 'string') {
    appError = handleDatabaseError(error);
  } else {
    // Неизвестная ошибка - конвертируем в внутреннюю ошибку сервера
    appError = new AppError(
      process.env.NODE_ENV === 'production' ? 'Внутренняя ошибка сервера' : error.message,
      ErrorCodes.INTERNAL_SERVER_ERROR,
      HttpStatus.INTERNAL_SERVER_ERROR,
      false
    );
  }

  // Логируем ошибку
  logError(appError, req);

  // Создаем стандартизированный API ответ
  const apiResponse: ApiResponse = {
    success: false,
    error: appError.toApiError(req),
    meta: {
      timestamp: new Date().toISOString(),
      requestId: req.get('x-request-id'),
      version: process.env.API_VERSION || '1.0.0'
    }
  };

  // Отправляем ответ
  res.status(appError.status).json(apiResponse);
};

// ===========================================
// ASYNC ERROR WRAPPER
// ===========================================

/**
 * Wrapper для async middleware и route handlers
 * Автоматически ловит Promise.reject и передает в error handler
 */
export const asyncHandler = <T extends Request = Request>(
  fn: (req: T, res: Response, next: NextFunction) => Promise<any>
) => {
  return (req: T, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// ===========================================
// NOT FOUND HANDLER
// ===========================================

/**
 * 404 handler для неизвестных routes
 */
export const notFoundHandler = (req: Request, res: Response, next: NextFunction): void => {
  const error = new NotFoundError(`Route ${req.method} ${req.path} не найден`);
  next(error);
};

// ===========================================
// SUCCESS RESPONSE HELPERS
// ===========================================

/**
 * Стандартизированный успешный ответ
 */
export const sendSuccess = <T = any>(
  res: Response,
  data: T,
  status: number = HttpStatus.OK,
  message?: string
): void => {
  const response: ApiResponse<T> = {
    success: true,
    data,
    ...(message && { message }),
    meta: {
      timestamp: new Date().toISOString()
    }
  };

  res.status(status).json(response);
};

/**
 * Стандартизированный ответ для создания ресурса
 */
export const sendCreated = <T = any>(res: Response, data: T, message?: string): void => {
  sendSuccess(res, data, HttpStatus.CREATED, message);
};

/**
 * Стандартизированный ответ без контента
 */
export const sendNoContent = (res: Response): void => {
  res.status(HttpStatus.NO_CONTENT).send();
};