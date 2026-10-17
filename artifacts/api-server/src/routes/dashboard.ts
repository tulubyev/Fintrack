import { Router, Response } from 'express';
import { logger } from "../services/logger";
import { authenticateToken } from '../middleware/auth.js';
import { storage } from '../storage';
import type { AuthenticatedRequest } from '../middleware/types.js';

const router = Router();

/**
 * DASHBOARD ROUTES MODULE
 * Extracted from main routes.ts for modular architecture
 * 
 * Routes:
 * - GET /stats - Get dashboard statistics (balance, income, expenses, savings)
 */

// Начало текущего и следующего месяца
const monthRange = () => {
  const now = new Date();
  return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: new Date(now.getFullYear(), now.getMonth() + 1, 1) };
};

// Get dashboard statistics
router.get('/stats', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { from, to } = monthRange();

    const [totalBalance, savingsGoals, cashFlow] = await Promise.all([
      storage.getTotalBalance(userId),
      storage.getSavingsGoals(userId),
      storage.getCashFlow(userId, from, to),
    ]);

    const totalSavings = savingsGoals.reduce((sum, goal) => sum + parseFloat(goal.currentAmount || "0"), 0);
    const savingsTarget = savingsGoals.reduce((sum, goal) => sum + parseFloat(goal.targetAmount || "0"), 0);

    res.json({
      totalBalance: parseFloat(totalBalance),
      monthlyIncome: parseFloat(cashFlow.income),
      monthlyExpenses: parseFloat(cashFlow.expenses),
      totalSavings,
      savingsTarget,
      savingsGoalsCount: savingsGoals.length,
    });
  } catch (error) {
    logger.error('Dashboard stats error:', error);
    res.status(500).json({ message: 'Ошибка получения статистики' });
  }
});

export default router;
