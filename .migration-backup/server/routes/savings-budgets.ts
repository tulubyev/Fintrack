import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth.js';
import { storage } from '../storage';
import type { AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

/**
 * SAVINGS & BUDGETS ROUTES MODULE
 * Extracted from main routes.ts for modular architecture
 * 
 * Routes:
 * - GET /savings-goals - Get user's savings goals
 * - POST /savings-goals - Create new savings goal
 * - PATCH /savings-goals/:goalId - Update savings goal
 * - GET /budgets - Get user's budgets for specific month/year
 * - POST /budgets - Create new budget
 */

// Validation schemas
const savingsGoalSchema = z.object({
  name: z.string().min(1, 'Название цели обязательно'),
  description: z.string().optional(),
  targetAmount: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Неверный формат суммы'),
  currentAmount: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Неверный формат суммы').optional(),
  targetDate: z.string().optional(),
});

const budgetSchema = z.object({
  category: z.string().min(1, 'Категория обязательна'),
  monthlyLimit: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Неверный формат лимита'),
  month: z.number().min(1).max(12),
  year: z.number(),
});

// SAVINGS GOALS ROUTES

// Get user's savings goals
router.get('/savings-goals', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const goals = await storage.getSavingsGoals(req.user!.id);
    res.json(goals);
  } catch (error) {
    res.status(500).json({ message: 'Ошибка получения целей накоплений' });
  }
});

// Create new savings goal
router.post('/savings-goals', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const validatedData = savingsGoalSchema.parse(req.body);
    const goal = await storage.createSavingsGoal({
      ...validatedData,
      userId: req.user!.id,
      targetDate: validatedData.targetDate ? new Date(validatedData.targetDate) : undefined,
    });
    res.json(goal);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.errors[0].message });
    }
    res.status(400).json({ message: error instanceof Error ? error.message : 'Ошибка создания цели' });
  }
});

// Update savings goal
router.patch('/savings-goals/:goalId', authenticateToken, async (req, res) => {
  try {
    const { goalId } = req.params;
    const updates = req.body;
    
    const goal = await storage.updateSavingsGoal(goalId, updates);
    if (!goal) {
      return res.status(404).json({ message: 'Цель не найдена' });
    }
    
    res.json(goal);
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : 'Ошибка обновления цели' });
  }
});

// BUDGET ROUTES

// Get user's budgets for specific month/year
router.get('/budgets', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const currentDate = new Date();
    const month = parseInt(req.query.month as string) || currentDate.getMonth() + 1;
    const year = parseInt(req.query.year as string) || currentDate.getFullYear();
    
    const budgets = await storage.getBudgets(req.user!.id, month, year);
    res.json(budgets);
  } catch (error) {
    res.status(500).json({ message: 'Ошибка получения бюджетов' });
  }
});

// Create new budget
router.post('/budgets', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const validatedData = budgetSchema.parse(req.body);
    const budget = await storage.createBudget({
      ...validatedData,
      userId: req.user!.id,
    });
    res.json(budget);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.errors[0].message });
    }
    res.status(400).json({ message: error instanceof Error ? error.message : 'Ошибка создания бюджета' });
  }
});

export default router;