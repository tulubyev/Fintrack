import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { verificationService } from '../services/verificationService.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

/**
 * VERIFICATION ROUTES MODULE
 * Extracted from main routes.ts for modular architecture
 * 
 * Routes:
 * - POST /send-sms - Send SMS verification code
 * - POST /verify-sms - Verify SMS code
 * - POST /send-email - Send email verification code
 * - POST /verify-email - Verify email code
 * - GET /test-sms - Test SMS service
 * - GET /test-email - Test email service
 */

// Send SMS verification code
router.post('/send-sms', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ message: 'Номер телефона обязателен' });
    }

    const result = await verificationService.sendSMSCode(req.user!.id, phone);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Send SMS error:', error);
    res.status(500).json({ success: false, message: 'Ошибка отправки SMS' });
  }
});

// Verify SMS code
router.post('/verify-sms', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { phone, code } = req.body;
    if (!phone || !code) {
      return res.status(400).json({ message: 'Номер телефона и код обязательны' });
    }

    const result = await verificationService.verifySMSCode(req.user!.id, phone, code);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Verify SMS error:', error);
    res.status(500).json({ success: false, message: 'Ошибка проверки SMS' });
  }
});

// Send email verification code
router.post('/send-email', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: 'Email обязателен' });
    }

    const result = await verificationService.sendEmailCode(req.user!.id, email);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Send email error:', error);
    res.status(500).json({ success: false, message: 'Ошибка отправки email' });
  }
});

// Verify email code
router.post('/verify-email', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) {
      return res.status(400).json({ message: 'Email и код обязательны' });
    }

    const result = await verificationService.verifyEmailCode(req.user!.id, email, code);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Verify email error:', error);
    res.status(500).json({ success: false, message: 'Ошибка проверки email' });
  }
});

// Test SMS service
router.get('/test-sms', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const result = await verificationService.testSMSService();
    res.json(result);
  } catch (error) {
    console.error('Test SMS error:', error);
    res.status(500).json({ success: false, error: 'Ошибка тестирования SMS сервиса' });
  }
});

// Test email service
router.get('/test-email', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const result = await verificationService.testEmailService();
    res.json(result);
  } catch (error) {
    console.error('Test email error:', error);
    res.status(500).json({ success: false, error: 'Ошибка тестирования email сервиса' });
  }
});

export default router;