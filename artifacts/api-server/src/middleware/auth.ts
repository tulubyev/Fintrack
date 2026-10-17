import jwt from "jsonwebtoken";
import { storage } from "../storage";
import { tokenCache } from "../services/tokenCache";
import { 
  AuthenticatedRequest, 
  OptionalAuthRequest,
  AsyncMiddleware,
  ErrorCodes
} from "./types";

export type { AuthenticatedRequest };
import { 
  AuthenticationError, 
  asyncHandler 
} from "./errorHandler";

/**
 * Проверка JWT токена и получение пользователя (оптимизирована с кэшем)
 */
const verifyToken = (token: string) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new AuthenticationError('JWT_SECRET не настроен', ErrorCodes.INTERNAL_SERVER_ERROR);
  }

  try {
    // jwt.verify - синхронная операция, очень быстрая
    const decoded = jwt.verify(token, secret) as any;
    return decoded;
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      throw new AuthenticationError('Токен истек', ErrorCodes.TOKEN_EXPIRED);
    }
    if (error.name === 'JsonWebTokenError') {
      throw new AuthenticationError('Недействительный токен', ErrorCodes.TOKEN_INVALID);
    }
    throw new AuthenticationError('Ошибка верификации токена', ErrorCodes.TOKEN_INVALID);
  }
};

/**
 * Основной authentication middleware
 * Требует наличие валидного JWT токена
 * ОПТИМИЗИРОВАНА: Кэширует токены и результаты getUser
 */
export const authenticateToken: AsyncMiddleware<AuthenticatedRequest> = asyncHandler(
  async (req: AuthenticatedRequest, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      throw new AuthenticationError('Токен доступа отсутствует', ErrorCodes.TOKEN_MISSING);
    }

    // OPTIMIZE: Проверяем кэш токена ДО верификации
    let decoded: any;
    let cached = tokenCache.get(token);
    
    if (cached) {
      // Токен уже в кэше - используем его напрямую
      decoded = cached.decoded;
    } else {
      // Верификация токена (синхронная - очень быстрая)
      decoded = verifyToken(token);
      // Кэшируем на время жизни токена
      tokenCache.set(token, decoded, decoded.userId);
    }
    
    // Получаем актуальные данные пользователя ДЛЯ КАЖДОГО запроса
    // (нельзя кэшировать, так как данные могут меняться)
    const user = await storage.getUser(decoded.userId);
    if (!user) {
      throw new AuthenticationError('Пользователь не найден', ErrorCodes.USER_NOT_FOUND);
    }

    // Добавляем пользователя в request
    req.user = user;
    req.isAuthenticated = () => true;

    next();
  }
);

/**
 * Опциональный authentication middleware
 * Не требует токена, но если есть - проверяет его
 * ОПТИМИЗИРОВАНА: Кэширует токены
 */
export const optionalAuth: AsyncMiddleware<OptionalAuthRequest> = asyncHandler(
  async (req: OptionalAuthRequest, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      req.user = undefined;
      return next();
    }

    try {
      // OPTIMIZE: Проверяем кэш токена
      let decoded: any;
      let cached = tokenCache.get(token);
      
      if (cached) {
        decoded = cached.decoded;
      } else {
        decoded = verifyToken(token);
        tokenCache.set(token, decoded, decoded.userId);
      }
      
      const user = await storage.getUser(decoded.userId);
      req.user = user || undefined;
    } catch (error) {
      // При опциональной аутентификации игнорируем ошибки токена
      req.user = undefined;
    }

    next();
  }
);