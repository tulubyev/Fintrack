import { Router, Request, Response } from 'express';
import { testingService } from '../services/testingService.js';

const router = Router();

/**
 * TESTING ROUTES MODULE (Development Only)
 * Extracted from main routes.ts for modular architecture
 * 
 * Routes:
 * - POST /create-users - Create test users with different roles
 * - POST /run-suite - Run full test suite
 * - POST /cleanup - Clean up test data
 * - GET /roles/:role - Test specific role functionality
 */

// These routes are only available in development environment
if (process.env.NODE_ENV === 'development') {

  // Create test users with different roles
  router.post('/create-users', async (req: Request, res: Response) => {
    try {
      const users = await testingService.createTestUsers();
      res.json({
        message: `Создано ${users.length} тестовых пользователей`,
        users: users.map(u => ({
          role: u.role,
          planType: u.planType,
          phone: u.credentials.phone,
          name: `${u.user.firstName} ${u.user.lastName}`,
        })),
      });
    } catch (error) {
      res.status(500).json({ 
        message: error instanceof Error ? error.message : 'Ошибка создания тестовых пользователей' 
      });
    }
  });

  // Run full test suite
  router.post('/run-suite', async (req: Request, res: Response) => {
    try {
      const results = await testingService.runFullTestSuite();
      res.json(results);
    } catch (error) {
      res.status(500).json({ 
        message: error instanceof Error ? error.message : 'Ошибка запуска тестов' 
      });
    }
  });

  // Clean up test data
  router.post('/cleanup', async (req: Request, res: Response) => {
    try {
      await testingService.cleanupTestData();
      res.json({ message: 'Тестовые данные очищены' });
    } catch (error) {
      res.status(500).json({ 
        message: error instanceof Error ? error.message : 'Ошибка очистки тестовых данных' 
      });
    }
  });

  // Test specific role functionality
  router.get('/roles/:role', async (req: Request, res: Response) => {
    try {
      const { role } = req.params;
      const result = await testingService.runRoleTest(role);
      res.json(result);
    } catch (error) {
      res.status(500).json({ 
        message: error instanceof Error ? error.message : `Ошибка тестирования роли ${req.params.role}` 
      });
    }
  });

} else {
  // In production, return 404 for all test routes
  router.use('*', (req: Request, res: Response) => {
    res.status(404).json({ message: 'Test routes are not available in production' });
  });
}

export default router;