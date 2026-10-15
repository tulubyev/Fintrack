import { Router, Request, Response } from 'express';
import { logger } from "../services/logger";
import { authenticateToken } from '../middleware/auth.js';
import { bankService } from '../services/bankService.js';
import { bankApiService } from '../services/bankApiService.js';
import { paymentService } from '../services/paymentService.js';
import { storage } from '../storage';
import { config } from '../../config/environment';
import type { AuthenticatedRequest } from '../middleware/types.js';

const router = Router();

/**
 * BANKS, PAYMENTS, ACCOUNTS & TRANSACTIONS MODULE
 * Extracted from main routes.ts for modular architecture
 * Consolidates all financial data routes and eliminates duplicates
 * 
 * Banking Routes:
 * - GET /connections - Get user bank connections
 * - POST /connect - Initiate bank connection
 * - POST /oauth-callback - Handle OAuth callback
 * - DELETE /connections/:connectionId - Disconnect bank
 * - GET /real/available - Get available banks for ПКС integration
 * - POST /real/connect - Connect to real bank via ПКС
 * - GET /real/callback/:bankCode - Handle real bank OAuth callback
 * - POST /real/sync/:connectionId - Sync bank data
 * - GET /available - Get available banks list
 * 
 * Payment Routes:
 * - GET /payments/providers - Get payment providers
 * - POST /payments/create - Create payment
 * - POST /payments/subscription - Create subscription
 * - GET /payments/status/:paymentId - Get payment status
 * 
 * Account & Transaction Routes:
 * - GET /accounts - Get user accounts
 * - GET /transactions - Get user transactions
 */

// ================== BANK CONNECTION ROUTES ==================

// Get user bank connections (consolidated from duplicates)
router.get('/connections', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const connections = await storage.getBankConnections(userId);
    
    // Don't return sensitive token data
    const safeConnections = connections.map(conn => ({
      id: conn.id,
      bankCode: conn.bankCode,
      bankName: conn.bankName,
      status: conn.status,
      lastSyncAt: conn.lastSyncAt,
      createdAt: conn.createdAt,
    }));

    res.json(safeConnections);
  } catch (error) {
    logger.error('Error fetching bank connections:', error);
    res.status(500).json({ message: 'Ошибка получения банковских подключений' });
  }
});

// Initiate bank connection
router.post('/connect', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { bankCode } = req.body;
    if (!bankCode) {
      return res.status(400).json({ message: 'Код банка обязателен' });
    }

    const result = await bankService.initiateOAuth(req.user!.id, bankCode);
    res.json(result);
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : 'Ошибка подключения банка' });
  }
});

// Handle OAuth callback
router.post('/oauth-callback', authenticateToken, async (req, res) => {
  try {
    const { consentId, authCode } = req.body;
    if (!consentId || !authCode) {
      return res.status(400).json({ message: 'Отсутствуют необходимые параметры' });
    }

    const connection = await bankService.handleOAuthCallback(consentId, authCode);
    res.json({ success: true, connectionId: connection.id });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : 'Ошибка OAuth callback' });
  }
});

// Disconnect bank
router.delete('/connections/:connectionId', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { connectionId } = req.params;
    await bankService.disconnectBank(req.user!.id, connectionId);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : 'Ошибка отключения банка' });
  }
});

// ================== REAL BANK API ROUTES (ПКС интеграция) ==================

// Get available banks for ПКС integration
router.get('/real/available', async (req: Request, res: Response) => {
  try {
    const banks = bankApiService.getAvailableBanks();
    res.json(banks);
  } catch (error) {
    logger.error('Ошибка получения доступных банков:', error);
    res.status(500).json({ message: 'Ошибка получения доступных банков' });
  }
});

// Connect to real bank via ПКС
router.post('/real/connect', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { bankCode } = req.body;
    const result = await bankApiService.initiateConnection(bankCode, req.user!.id);
    res.json(result);
  } catch (error) {
    logger.error('Ошибка подключения к банку:', error);
    res.status(500).json({ message: (error as Error).message || 'Ошибка подключения к банку' });
  }
});

// Handle real bank OAuth callback
router.get('/real/callback/:bankCode', async (req: Request, res: Response) => {
  try {
    const { bankCode } = req.params;
    const { code, state } = req.query;
    
    if (!code || !state) {
      return res.status(400).json({ message: 'Отсутствуют необходимые параметры' });
    }

    // Извлекаем userId из state (format: consent_userId_bankCode_timestamp)
    const stateParts = (state as string).split('_');
    if (stateParts.length < 2) {
      return res.status(400).json({ message: 'Неверный формат state' });
    }
    
    const userId = stateParts[1];
    const result = await bankApiService.handleOAuthCallback(
      bankCode, 
      code as string, 
      state as string, 
      userId
    );
    
    // Перенаправляем на фронтенд с результатом
    if (result.success) {
      res.redirect(`${config.banks.baseUrl}/?bank_connected=true&bank=${bankCode}`);
    } else {
      res.redirect(`${config.banks.baseUrl}/?bank_error=true&bank=${bankCode}`);
    }
  } catch (error) {
    logger.error('Ошибка обработки OAuth callback:', error);
    res.redirect(`${config.banks.baseUrl}/?bank_error=true&message=${encodeURIComponent((error as Error).message)}`);
  }
});

// Sync bank data
router.post('/real/sync/:connectionId', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { connectionId } = req.params;
    await bankApiService.syncAccountsForConnection(connectionId);
    res.json({ 
      message: 'Синхронизация завершена',
      lastSync: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Ошибка синхронизации:', error);
    res.status(500).json({ message: (error as Error).message || 'Ошибка синхронизации данных банка' });
  }
});

// Get available banks (mock list)
router.get('/available', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Return list of available banks for connection
    const availableBanks = [
      { code: 'sberbank', name: 'Сбербанк', description: 'Самый крупный банк России' },
      { code: 'vtb', name: 'ВТБ', description: 'Второй по величине банк России' },
      { code: 'tinkoff', name: 'Тинькофф Банк', description: 'Цифровой банк с удобным интерфейсом' },
      { code: 'alfabank', name: 'Альфа-Банк', description: 'Крупнейший частный банк России' },
      { code: 'gazprombank', name: 'Газпромбанк', description: 'Один из крупнейших банков России' },
      { code: 'raiffeisenbank', name: 'Райффайзенбанк', description: 'Европейский банк в России' }
    ];
    res.json(availableBanks);
  } catch (error) {
    logger.error('Error fetching available banks:', error);
    res.status(500).json({ message: 'Ошибка получения списка банков' });
  }
});

// ================== PAYMENT ROUTES (российские платежные системы) ==================

// Get payment providers
router.get('/payments/providers', async (req: Request, res: Response) => {
  try {
    const providers = paymentService.getAvailableProviders();
    res.json(providers);
  } catch (error) {
    logger.error('Ошибка получения провайдеров:', error);
    res.status(500).json({ message: 'Ошибка получения провайдеров' });
  }
});

// Create payment
router.post('/payments/create', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { amount, description, returnUrl, provider } = req.body;
    
    const payment = await paymentService.createPayment({
      amount: parseFloat(amount),
      currency: 'RUB',
      description: description || 'Оплата подписки FinTrack',
      orderId: `order_${req.user!.id}_${Date.now()}`,
      customerEmail: req.user!.email ?? undefined,
      customerPhone: req.user!.phone,
      returnUrl: returnUrl || `${process.env.BASE_URL}/payment/success`,
      metadata: {
        userId: req.user!.id,
      },
    }, provider);
    
    res.json(payment);
  } catch (error) {
    logger.error('Ошибка создания платежа:', error);
    res.status(500).json({ message: (error as Error).message || 'Ошибка создания платежа' });
  }
});

// Create subscription
router.post('/payments/subscription', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { planId, amount, period, provider } = req.body;
    
    const subscription = await paymentService.createSubscription({
      planId,
      customerId: req.user!.id,
      amount: parseFloat(amount),
      period: period || 'month',
      description: `Подписка FinTrack ${planId}`,
    }, provider);
    
    res.json(subscription);
  } catch (error) {
    logger.error('Ошибка создания подписки:', error);
    res.status(500).json({ message: (error as Error).message || 'Ошибка создания подписки' });
  }
});

// Get payment status
router.get('/payments/status/:paymentId', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { paymentId } = req.params;
    const { provider } = req.query;
    
    const status = await paymentService.getPaymentStatus(paymentId, provider as string);
    res.json(status);
  } catch (error) {
    logger.error('Ошибка получения статуса платежа:', error);
    res.status(500).json({ message: (error as Error).message || 'Ошибка получения статуса' });
  }
});

// ================== ACCOUNT & TRANSACTION ROUTES ==================

// Get user accounts
router.get('/accounts', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const accounts = await storage.getAccounts(req.user!.id);
    res.json(accounts);
  } catch (error) {
    logger.error('Error fetching accounts:', error);
    res.status(500).json({ message: 'Ошибка получения счетов' });
  }
});

// Get user transactions
router.get('/transactions', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const transactions = await storage.getTransactions(req.user!.id, limit);
    res.json(transactions);
  } catch (error) {
    logger.error('Error fetching transactions:', error);
    res.status(500).json({ message: 'Ошибка получения транзакций' });
  }
});

export default router;