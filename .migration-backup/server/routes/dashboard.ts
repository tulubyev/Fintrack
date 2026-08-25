import { Router, Request, Response } from 'express';
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
 * - GET /spending-categories - Get monthly spending by categories
 * - GET /admin/metrics - Enhanced admin dashboard metrics (admin only)
 */

// Get dashboard statistics
router.get('/stats', authenticateToken as any, async (req: any, res) => {
  try {
    const userId = req.user!.id;
    const currentDate = new Date();
    const month = currentDate.getMonth() + 1;
    const year = currentDate.getFullYear();

    const [totalBalance, savingsGoals] = await Promise.all([
      storage.getTotalBalance(userId),
      storage.getSavingsGoals(userId),
    ]);

    // Получаем income/expenses через транзакции
    const monthlyIncome = "1000"; // placeholder  
    const monthlyExpenses = "800"; // placeholder

    const totalSavings = savingsGoals.reduce((sum: number, goal: any) => sum + parseFloat(goal.currentAmount || "0"), 0);

    res.json({
      totalBalance: parseFloat(totalBalance),
      monthlyIncome: parseFloat(monthlyIncome),
      monthlyExpenses: parseFloat(monthlyExpenses),
      totalSavings,
      savingsGoalsCount: savingsGoals.length,
    });
  } catch (error) {
    logger.error('Dashboard stats error:', error);
    res.status(500).json({ message: 'Ошибка получения статистики' });
  }
});

// Get monthly spending by categories
router.get('/spending-categories', authenticateToken as any, async (req: any, res) => {
  try {
    const userId = req.user!.id;
    const currentDate = new Date();
    const month = currentDate.getMonth() + 1;
    const year = currentDate.getFullYear();

    const categories: any[] = []; // placeholder для категорий трат
    res.json(categories);
  } catch (error) {
    logger.error('Dashboard spending categories error:', error);
    res.status(500).json({ message: 'Ошибка получения категорий трат' });
  }
});

// Enhanced admin dashboard metrics (admin only) - TEMPORARY DISABLED
// Will be re-enabled when admin metrics are implemented in storage
// router.get('/admin/metrics', authenticateToken, async (req: AuthenticatedRequest, res) => {
//   try {
//     const metrics = { totalUsers: 0, totalTransactions: 0, totalVolume: 0 }; // Mock metrics
//     res.json(metrics);
//   } catch (error) {
//     logger.error('Admin dashboard metrics error:', error);
//     res.status(500).json({ message: 'Ошибка получения админ-метрик' });
//   }
// });

export default router;