/**
 * Issue #7 FIX: Comprehensive Input Validation Rules
 * Prevents SQL injection, XSS, and invalid data
 */

import { z } from 'zod';

export const validationRules = {
  // Auth validation
  phone: z.string()
    .regex(/^\+7[0-9]{10}$/, 'Invalid Russian phone format')
    .min(11)
    .max(12),
  
  password: z.string()
    .min(12, 'Password must be at least 12 characters')
    .regex(/[A-Z]/, 'Must contain uppercase letter')
    .regex(/[a-z]/, 'Must contain lowercase letter')
    .regex(/[0-9]/, 'Must contain number')
    .regex(/[!@#$%^&*]/, 'Must contain special character'),
  
  email: z.string()
    .email('Invalid email format')
    .max(255),
  
  // Financial data validation
  amount: z.number()
    .positive('Amount must be positive')
    .finite('Invalid amount')
    .max(999999999, 'Amount too large'),
  
  accountNumber: z.string()
    .regex(/^[A-Z0-9]{15,34}$/, 'Invalid account number'),
  
  bankCode: z.string()
    .regex(/^[0-9]{9}$/, 'Invalid bank code'),
  
  // Transaction validation
  description: z.string()
    .max(500)
    .refine(
      val => !/<script|javascript:|onerror|onclick/i.test(val),
      'Contains invalid characters'
    ),
  
  // User data validation
  firstName: z.string()
    .min(1)
    .max(100)
    .regex(/^[А-Яа-яЁё\s\-']+$/, 'Invalid characters in name'),
  
  lastName: z.string()
    .min(1)
    .max(100)
    .regex(/^[А-Яа-яЁё\s\-']+$/, 'Invalid characters in name'),
  
  // API key validation
  apiKey: z.string()
    .min(32)
    .max(256)
    .regex(/^[a-zA-Z0-9]+$/, 'API key must be alphanumeric'),
};

export const createValidationMiddleware = (schema: z.ZodSchema) => {
  return async (req: any, res: any, next: any) => {
    try {
      req.validatedBody = await schema.parseAsync(req.body);
      next();
    } catch (error: any) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: error.errors?.map((e: any) => ({
          path: e.path.join('.'),
          message: e.message
        }))
      });
    }
  };
};
