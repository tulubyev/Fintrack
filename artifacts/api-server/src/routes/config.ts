import { Router, Request, Response } from 'express';
import { config } from '../../config/environment';

const router = Router();

/**
 * FRONTEND CONFIG API MODULE
 * Provides safe configuration values to frontend clients
 * 
 * Routes:
 * - GET /public - Get public configuration values (no auth required)
 * - GET /user - Get user-specific configuration values (auth required)
 */

// Public configuration endpoint (no authentication required)
router.get('/public', async (req: Request, res: Response) => {
  try {
    // Only expose safe, non-sensitive configuration values to frontend
    const publicConfig = {
      // UI Configuration
      ui: {
        verification: {
          smsTimeout: 60, // seconds
          emailTimeout: 120, // seconds
          maxRetries: 3
        },
        uploads: {
          maxFileSize: config.uploads.maxFileSize,
          maxFileSizeMB: Math.round(config.uploads.maxFileSize / (1024 * 1024))
        },
        chat: {
          contextSize: 5, // number of messages
          maxMessageLength: 1000
        },
        sidebar: {
          cookieName: 'fintrack-sidebar-collapsed',
          cookieMaxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
          width: 280,
          widthMobile: 240,
          widthIcon: 80,
          keyboardShortcut: 'Ctrl+B'
        },
        toast: {
          limit: 1,
          removeDelay: 1000
        },
        chart: {
          animationDuration: 300
        }
      },
      
      // API Configuration
      api: {
        endpoints: {
          // Auth endpoints
          auth: {
            login: '/api/auth/login',
            register: '/api/auth/register',
            refresh: '/api/auth/refresh',
            verify: '/api/auth/verify',
            logout: '/api/auth/logout',
            gosuslugi: '/api/auth/gosuslugi'
          },
          
          // Verification endpoints
          verification: {
            sendSms: '/api/verification/send-sms',
            sendEmail: '/api/verification/send-email',
            verifySms: '/api/verification/verify-sms',
            verifyEmail: '/api/verification/verify-email'
          },
          
          // Dashboard endpoints
          dashboard: {
            stats: '/api/dashboard/stats'
          },
          
          // Account & Transaction endpoints
          accounts: '/api/accounts',
          transactions: '/api/transactions',
          
          // Savings & Budget endpoints
          savingsGoals: '/api/v1/goals',
          budgets: '/api/v1/budgets',
          
          // Profile endpoints
          profile: {
            update: '/api/profile/update',
            uploadImage: '/api/profile/upload-image'
          },
          
          // Document endpoints
          documents: {
            list: '/api/documents',
            upload: '/api/documents/upload',
            download: '/api/documents',
            types: '/api/documents/types'
          },
          
          // AI endpoints
          ai: {
            chat: '/api/ai/chat',
            session: '/api/ai/chat/session',
            message: '/api/ai/chat/message',
            insights: '/api/ai/insights'
          },
          
          // Admin endpoints
          admin: {
            users: '/api/admin/users',
            documents: '/api/admin/documents',
            system: '/api/admin/system-info'
          },
          
          // Two-Factor Auth endpoints
          twoFactor: {
            status: '/api/auth/2fa/status',
            setup: '/api/auth/2fa/setup',
            enable: '/api/auth/2fa/enable',
            disable: '/api/auth/2fa/disable'
          },
          
          // ESIA endpoints
          esia: {
            authorize: '/api/auth/esia/authorize',
            mock: '/api/auth/esia/mock'
          }
        },
        
        // Request configuration
        timeout: 30000, // 30 seconds
        retryAttempts: 3
      },
      
      // Business Rules Configuration
      business: {
        verification: {
          limits: {
            unverified: '15 000 ₽/мес',
            phone: '100 000 ₽/мес', 
            documents: '1 000 000 ₽/мес'
          },
          requirements: [
            'Подтверждение телефона',
            'Подтверждение email',
            'Загрузка документов'
          ]
        },
        
        sync: {
          defaultInterval: '15 минут',
          maxRetries: 5
        }
      },
      
      // Environment info (safe to expose)
      environment: {
        isProduction: process.env.NODE_ENV === 'production',
        isDevelopment: process.env.NODE_ENV === 'development',
        version: process.env.npm_package_version || '1.0.0'
      }
    };

    // Cache control for public config
    res.setHeader('Cache-Control', 'public, max-age=300'); // 5 minutes cache
    res.json(publicConfig);
  } catch (error) {
    console.error('Error fetching public config:', error);
    res.status(500).json({ message: 'Ошибка получения конфигурации' });
  }
});

export default router;