import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { esiaService } from '../services/esiaService.js';
import { sessionService, sendSession } from '../services/sessionService.js';
import { config } from '../../config/environment';

const router = Router();

/**
 * ESIA (ГОСУСЛУГИ) INTEGRATION ROUTES MODULE
 * Extracted from main routes.ts for modular architecture
 * 
 * Routes:
 * - POST /mock - Mock authorization via Госуслуги (development only)
 * - GET /status - Get ESIA integration status
 * - GET /authorize - Initiate OAuth2 authorization via Госуслуги
 * - GET /callback - Handle OAuth2 callback from Госуслуги
 */

// Rate limiting for auth routes
const authLimiter = rateLimit({
  windowMs: config.esia.windowMs,
  max: config.esia.maxAttempts,
  message: { message: 'Слишком много попыток входа. Попробуйте снова через 15 минут.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Mock авторизация через Госуслуги (только для разработки и тестов)
router.post('/mock', authLimiter, async (req: Request, res: Response) => {
  try {
    const { mockUser } = req.body;
    
    if (!mockUser) {
      return res.status(400).json({ message: 'Mock пользователь не предоставлен' });
    }

    // Проверяем, что мы в режиме разработки или mock режиме
    if (process.env.NODE_ENV === 'production' && process.env.ESIA_MOCK_MODE !== 'true') {
      return res.status(403).json({ 
        message: 'Mock авторизация недоступна в production без ESIA_MOCK_MODE' 
      });
    }

    const user = await esiaService.createOrUpdateUser(mockUser);
    const tokens = sendSession(res, await sessionService.createSession(user, req));
    
    res.json({
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        isVerified: user.isVerified,
        verificationMethod: user.verificationMethod,
      },
      accessToken: tokens.accessToken,
      message: 'Mock авторизация ЕСИА успешна'
    });
  } catch (error) {
    console.error('ЕСИА mock error:', error);
    res.status(400).json({ message: error instanceof Error ? error.message : 'Ошибка mock авторизации' });
  }
});

// Получение статуса интеграции с ЕСИА
router.get('/status', async (req: Request, res: Response) => {
  try {
    const status = esiaService.getIntegrationStatus();
    res.json(status);
  } catch (error) {
    console.error('Ошибка получения статуса ЕСИА:', error);
    res.status(500).json({ message: 'Ошибка получения статуса' });
  }
});

// Инициация OAuth2 авторизации через Госуслуги
router.get('/authorize', async (req: Request, res: Response) => {
  try {
    if (process.env.NODE_ENV === 'development' || process.env.ESIA_MOCK_MODE === 'true') {
      // В режиме разработки перенаправляем на страницу с объяснением
      return res.redirect('/?esia_info=mock_mode');
    }
    
    const authUrl = await esiaService.generateAuthUrl();
    res.redirect(authUrl);
  } catch (error) {
    console.error('Ошибка создания URL авторизации ЕСИА:', error);
    res.status(500).json({ message: error instanceof Error ? error.message : 'Ошибка создания URL авторизации' });
  }
});

// Обработка OAuth2 callback от Госуслуг
// SECURITY FIX: Токен передается через httpOnly cookie, а не через URL
router.get('/callback', async (req: Request, res: Response) => {
  try {
    const { code, state } = req.query;
    
    if (!code) {
      return res.status(400).json({ message: 'Код авторизации отсутствует' });
    }

    const result = await esiaService.handleCallback(code as string, state as string);
    const user = await esiaService.createOrUpdateUser(result.userInfo);
    const tokens = sendSession(res, await sessionService.createSession(user, req));
    
    // SECURITY FIX: Устанавливаем токен в cookie вместо URL параметра
    // Это предотвращает:
    // - Утечку токена в истории браузера (главная угроза)
    // - Утечку через referer headers
    // - Кэширование токена прокси-серверами
    // 
    // NOTE: httpOnly=false необходим т.к. SPA должен прочитать токен.
    // Риск XSS минимизирован за счет:
    // - Короткого TTL (10 секунд)
    // - SameSite: strict
    // - Немедленного удаления cookie после прочтения
    res.cookie('esia_auth_token', tokens.accessToken, {
      httpOnly: false, // SPA читает и сразу удаляет
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict', // Строгая защита от CSRF
      maxAge: 10000, // 10 секунд - минимальное время для прочтения
      path: '/'
    });
    
    // Устанавливаем флаг успешной авторизации
    res.cookie('esia_auth_success', 'true', {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 10000,
      path: '/'
    });
    
    // Перенаправляем на фронтенд БЕЗ токена в URL
    res.redirect(`${config.banks.baseUrl}/?esia_callback=success`);
  } catch (error) {
    console.error('Ошибка обработки callback ЕСИА:', error);
    const errorMessage = error instanceof Error ? error.message : 'Ошибка авторизации';
    res.redirect(`${config.banks.baseUrl}/?esia_error=${encodeURIComponent(errorMessage)}`);
  }
});

export default router;