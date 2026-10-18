import { Router } from 'express';
import { logger } from "../services/logger";
import { authenticateToken } from '../middleware/auth.js';
import { rateLimiters } from '../middleware';
import { storage } from '../storage';
import type { AuthenticatedRequest } from '../middleware/types.js';

const router = Router();

/**
 * Счета и операции пользователя.
 *
 * Routes:
 * - GET /accounts - счета пользователя
 * - GET /transactions?limit= - последние операции (до 200)
 */

router.get('/accounts', rateLimiters.general, authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const accounts = await storage.getAccounts(req.user!.id);
    res.json(accounts);
  } catch (error) {
    logger.error('Error fetching accounts:', error);
    res.status(500).json({ message: 'Ошибка получения счетов' });
  }
});

router.get('/transactions', rateLimiters.general, authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 200);
    const transactions = await storage.getTransactions(req.user!.id, limit);
    res.json(transactions);
  } catch (error) {
    logger.error('Error fetching transactions:', error);
    res.status(500).json({ message: 'Ошибка получения транзакций' });
  }
});

export default router;
