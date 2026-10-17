import { Router, type Request, type Response } from "express";
import { authService } from "../services/authService";
import { twoFactorService } from "../services/twoFactorService";
import { esiaService } from "../services/esiaService";
import { userService } from "../services/UserService";
import { authenticateToken, type AuthenticatedRequest } from "../middleware/auth";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { config } from "../../config/environment";
import { validationRules } from "../middleware/validationRules";
import { logger } from "../services/logger";
import { secureLogs } from "../middleware/secureLogs";
import { passwordResetService, PasswordResetError, RESET_REQUEST_MESSAGE } from "../services/passwordResetService";
import { sessionService, SessionError, REFRESH_COOKIE, refreshCookieOptions, sendSession } from "../services/sessionService";

// Auth rate limiting (из config)
const authLimiter = rateLimit({
  windowMs: config.rateLimits.auth.windowMs,
  max: config.rateLimits.auth.max,
  message: "Слишком много попыток входа, попробуйте позже",
});

// Validation schemas для auth роутов (Issue #7 & #10 FIX: Strong validation)
const registerSchema = z.object({
  email: validationRules.email.optional().or(z.literal('').transform(() => undefined)),
  password: validationRules.password, // Strong password: 12+ chars, upper/lower/number/special
  firstName: validationRules.firstName,
  lastName: validationRules.lastName,
  phone: validationRules.phone,
});

const loginSchema = z.object({
  phone: validationRules.phone.optional(),
  email: validationRules.email.optional(),
  identifier: z.string().optional(),
  password: z.string().min(1, 'Пароль обязателен'), // Don't validate on login, only on register
  twoFactorCode: z.string().optional(),
}).refine(data => data.phone || data.email || data.identifier, {
  message: "Укажите телефон, email или identifier для входа",
  path: ["phone"]
});

// Восстановление пароля: отдельный лимит — запрос всегда отвечает 200 и не попадает
// в общий лимит auth (он считает только неудачные ответы), а каждое SMS платное
const passwordResetRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { message: "Слишком много запросов на восстановление пароля, попробуйте позже" },
});

const passwordResetVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: "Слишком много попыток, попробуйте позже" },
});

const forgotPasswordSchema = z.object({
  identifier: z.string().trim().min(3, 'Укажите email или телефон'),
  channel: z.enum(['sms', 'email']).optional(),
});

const resetPasswordSchema = z.object({
  identifier: z.string().trim().min(3, 'Укажите email или телефон'),
  code: z.string().trim().regex(/^\d{6}$/, 'Код состоит из 6 цифр'),
  newPassword: validationRules.password,
});

const twoFactorVerifySchema = z.object({
  code: z.string().min(6, 'Код должен содержать минимум 6 символов'),
});

// Секрет и резервные коды берутся из настройки на сервере, от клиента — только код подтверждения
const enableTwoFactorSchema = z.object({
  verificationCode: z.string().trim().length(6, 'Код должен содержать 6 цифр'),
});

// cookie-parser не подключён: достаём одно значение из заголовка Cookie
function readCookie(req: Request, name: string): string | undefined {
  const pair = (req.headers.cookie || '').split(';').map((c) => c.trim()).find((c) => c.startsWith(`${name}=`));
  return pair ? decodeURIComponent(pair.slice(name.length + 1)) : undefined;
}

function readRefreshToken(req: Request): string | undefined {
  const fromBody = typeof req.body?.refreshToken === 'string' ? req.body.refreshToken : undefined;
  return fromBody || readCookie(req, REFRESH_COOKIE);
}

// Создаем роутер
const authRouter = Router();

// Authentication routes
authRouter.post('/register', authLimiter, async (req, res) => {
  try {
    const validatedData = registerSchema.parse(req.body);
    // Очищаем пустой email, заменяя на undefined
    if (validatedData.email === '') {
      validatedData.email = undefined;
    }
    // Issue #8 FIX: Secure logging (no passwords in logs)
    logger.info('Registration attempt', secureLogs.sanitize({ phone: validatedData.phone, email: validatedData.email }));
    const result = await authService.register(validatedData as any);
    logger.info('Registration successful', { userId: result.user.id });

    const session = sendSession(res, await sessionService.createSession(result.user, req));
    
    res.json({
      user: {
        id: result.user.id,
        firstName: result.user.firstName,
        lastName: result.user.lastName,
        email: result.user.email,
        phone: result.user.phone,
        role: result.user.role,
        isEmailVerified: result.user.isEmailVerified,
        isPhoneVerified: result.user.isPhoneVerified
      },
      ...session,
      message: 'Регистрация успешна'
    });
  } catch (error: any) {
    logger.error('Registration error', secureLogs.logError(error));
    res.status(400).json({ 
      message: error.message || 'Ошибка регистрации' 
    });
  }
});

authRouter.post('/login', authLimiter, async (req, res) => {
  try {
    const validatedData = loginSchema.parse(req.body);
    const { phone, email, identifier, password, twoFactorCode } = validatedData;
    // Используем phone, email или identifier как логин
    const loginIdentifier = phone || email || identifier;
    
    if (!loginIdentifier) {
      return res.status(400).json({ message: 'Укажите телефон, email или identifier для входа' });
    }
    
    // Первый этап - проверяем логин и пароль через UserService
    const authResult = await userService.verifyUserCredentials(loginIdentifier, password);
    const loginResult = { user: authResult.user };
    
    // Проверяем нужна ли 2FA
    const requiresTwoFactor = await twoFactorService.requiresTwoFactor(loginResult.user.id);
    
    if (requiresTwoFactor && !twoFactorCode) {
      // Токен не выдаём до проверки второго фактора: клиент повторяет вход с twoFactorCode
      return res.status(206).json({
        requiresTwoFactor: true,
        message: 'Требуется код двухфакторной аутентификации'
      });
    }
    
    if (requiresTwoFactor && twoFactorCode) {
      // Проверяем 2FA код
      const isValidTwoFactor = await twoFactorService.verifyTwoFactor(loginResult.user.id, twoFactorCode);
      if (!isValidTwoFactor) {
        return res.status(400).json({
          message: 'Неверный код двухфакторной аутентификации'
        });
      }
    }
    
    // Сессия создаётся только после пароля и, если включена, 2FA
    const session = sendSession(res, await sessionService.createSession(loginResult.user, req));
    
    res.json({
      user: {
        id: loginResult.user.id,
        firstName: loginResult.user.firstName,
        lastName: loginResult.user.lastName,
        email: loginResult.user.email,
        phone: loginResult.user.phone,
        role: loginResult.user.role,
        adminRole: loginResult.user.adminRole, // КРИТИЧНО для админ-панели
        isEmailVerified: loginResult.user.isEmailVerified,
        isPhoneVerified: loginResult.user.isPhoneVerified,
        isVerified: loginResult.user.isVerified,
        verificationLevel2: loginResult.user.verificationLevel2,
        verificationLevel3: loginResult.user.verificationLevel3,
        profileImageUrl: loginResult.user.profileImageUrl
      },
      ...session,
      message: 'Успешный вход'
    });
  } catch (error: any) {
    logger.error('Login error:', secureLogs.logError(error));
    res.status(400).json({ 
      message: error.message || 'Ошибка авторизации' 
    });
  }
});

authRouter.post('/password/forgot', passwordResetRequestLimiter, async (req, res) => {
  try {
    const { identifier, channel } = forgotPasswordSchema.parse(req.body);
    // Ответ не ждёт поиска и доставки кода: иначе по времени ответа видно, существует ли аккаунт
    passwordResetService.requestReset(identifier, channel).catch((err) =>
      logger.error('Password reset request error:', secureLogs.logError(err)),
    );
    res.json({ message: RESET_REQUEST_MESSAGE });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.errors[0]?.message || 'Некорректные данные' });
    }
    logger.error('Password reset request error:', secureLogs.logError(error));
    res.json({ message: RESET_REQUEST_MESSAGE });
  }
});

authRouter.post('/password/reset', passwordResetVerifyLimiter, async (req, res) => {
  try {
    const { identifier, code, newPassword } = resetPasswordSchema.parse(req.body);
    await passwordResetService.resetPassword(identifier, code, newPassword);
    res.json({ message: 'Пароль изменён. Войдите с новым паролем' });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.errors[0]?.message || 'Некорректные данные' });
    }
    if (error instanceof PasswordResetError) {
      return res.status(400).json({ message: error.message });
    }
    logger.error('Password reset error:', secureLogs.logError(error));
    res.status(500).json({ message: 'Не удалось изменить пароль' });
  }
});

authRouter.post('/refresh', async (req, res) => {
  try {
    const refreshToken = readRefreshToken(req);
    if (!refreshToken) {
      return res.status(401).json({ message: 'Сессия не найдена, войдите снова' });
    }

    const tokens = await sessionService.refresh(refreshToken, req);
    res.json(sendSession(res, tokens));
  } catch (error: any) {
    if (!(error instanceof SessionError)) {
      logger.error('Token refresh error:', secureLogs.logError(error));
    }
    res.clearCookie(REFRESH_COOKIE, refreshCookieOptions);
    res.status(401).json({ message: error instanceof SessionError ? error.message : 'Сессия недействительна, войдите снова' });
  }
});

// Выход: завершает текущую сессию (по refresh-токену или по access-токену)
authRouter.post('/logout', async (req, res) => {
  try {
    const refreshToken = readRefreshToken(req);
    if (refreshToken) {
      await sessionService.revokeByRefreshToken(refreshToken);
    }
  } catch (error: any) {
    logger.error('Logout error:', secureLogs.logError(error));
  }
  res.clearCookie(REFRESH_COOKIE, refreshCookieOptions);
  res.json({ message: 'Успешный выход' });
});

// Устройства, на которых выполнен вход
authRouter.get('/sessions', authenticateToken, async (req: AuthenticatedRequest, res) => {
  res.json(await sessionService.list(req.user.id, req.sessionId));
});

authRouter.delete('/sessions/:sessionId', authenticateToken, async (req: AuthenticatedRequest, res) => {
  const revoked = await sessionService.revoke(req.params.sessionId, req.user.id);
  if (!revoked) {
    return res.status(404).json({ message: 'Сессия не найдена' });
  }
  if (req.params.sessionId === req.sessionId) {
    res.clearCookie(REFRESH_COOKIE, refreshCookieOptions);
  }
  res.json({ message: 'Сессия завершена' });
});

// «Выйти на всех устройствах», включая текущее
authRouter.post('/logout-all', authenticateToken, async (req: AuthenticatedRequest, res) => {
  const count = await sessionService.revokeAll(req.user.id);
  res.clearCookie(REFRESH_COOKIE, refreshCookieOptions);
  res.json({ message: 'Вы вышли на всех устройствах', revoked: count });
});

// Проверка статуса авторизации
authRouter.get('/verify', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    res.json({
      user: {
        id: req.user.id,
        firstName: req.user.firstName,
        lastName: req.user.lastName,
        email: req.user.email,
        phone: req.user.phone,
        role: req.user.role,
        adminRole: req.user.adminRole, // КРИТИЧНО для админ-панели
        isEmailVerified: req.user.isEmailVerified,
        isPhoneVerified: req.user.isPhoneVerified,
        isVerified: req.user.isVerified,
        isEsiaVerified: req.user.verificationMethod === 'esia' || Boolean(req.user.esiaOid),
        verificationLevel1: Boolean(req.user.isPhoneVerified || req.user.isEmailVerified),
        verificationLevel2: req.user.verificationLevel2,
        verificationLevel3: req.user.verificationLevel3,
        profileImageUrl: req.user.profileImageUrl,
        twoFactorEnabled: req.user.twoFactorEnabled
      }
    });
  } catch (error: any) {
    logger.error('Verify error:', secureLogs.logError(error));
    res.status(500).json({ message: 'Ошибка проверки пользователя' });
  }
});

// Mock Gosuslugi OAuth
authRouter.post('/gosuslugi', async (req, res) => {
  try {
    const { code } = req.body;
    // Mock implementation - в реальности здесь будет реальная интеграция с Госуслугами
    const mockUser = {
      id: 'gosuslugi_' + Math.random().toString(36).substr(2, 9),
      email: 'user@gosuslugi.ru',
      firstName: 'Иван',
      lastName: 'Иванов',
      phone: '+79999999999',
      role: 'personal',
      isEmailVerified: true,
      isPhoneVerified: true,
      isEsiaVerified: true
    };
    
    res.json({ user: mockUser, message: 'Успешная авторизация через Госуслуги' });
  } catch (error: any) {
    logger.error('Gosuslugi auth error:', secureLogs.logError(error));
    res.status(400).json({ message: error.message || 'Ошибка авторизации через Госуслуги' });
  }
});

// Two-Factor Authentication Routes
authRouter.post('/2fa/setup', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user.id;
    if (req.user.twoFactorEnabled) {
      return res.status(400).json({ message: 'Двухфакторная аутентификация уже включена' });
    }
    // Секрет и резервные коды сохраняются на сервере до подтверждения кодом
    const setup = await twoFactorService.startTOTPSetup(userId);
    res.json(setup);
  } catch (error: any) {
    logger.error('2FA setup error:', secureLogs.logError(error));
    res.status(400).json({ message: error.message || 'Ошибка настройки 2FA' });
  }
});

authRouter.post('/2fa/enable', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { verificationCode } = enableTwoFactorSchema.parse(req.body);
    const userId = req.user.id;
    
    await twoFactorService.enableTwoFactor(userId, verificationCode);
    res.json({ message: 'Двухфакторная аутентификация включена' });
  } catch (error: any) {
    logger.error('2FA enable error:', secureLogs.logError(error));
    res.status(400).json({ message: error.message || 'Ошибка включения 2FA' });
  }
});

authRouter.post('/2fa/disable', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { code } = twoFactorVerifySchema.parse(req.body);
    const userId = req.user.id;
    
    await twoFactorService.disableTwoFactor(userId, code);
    res.json({ message: 'Двухфакторная аутентификация отключена' });
  } catch (error: any) {
    logger.error('2FA disable error:', secureLogs.logError(error));
    res.status(400).json({ message: error.message || 'Ошибка отключения 2FA' });
  }
});

authRouter.get('/2fa/status', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user.id;
    // Simplified 2FA status check
    const twoFactorEnabled = req.user.twoFactorEnabled || false;
    res.json({ twoFactorEnabled });
  } catch (error: any) {
    logger.error('2FA status error:', secureLogs.logError(error));
    res.status(400).json({ message: error.message || 'Ошибка проверки статуса 2FA' });
  }
});

// ESIA routes moved to dedicated module: server/routes/esia.ts

export default authRouter;