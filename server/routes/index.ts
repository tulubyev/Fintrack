import { Router } from "express";
import { collectMetrics, createHelmet, createCors, cache, rateLimiters } from "../middleware";
import { queryOptimizationMiddleware } from "../middleware/queryOptimization";
import { config } from "../../config/environment";
import authRouter from "./auth.js";
import adminRouter from "./admin.js";
import documentsRouter from "./documents.js";
import verificationRouter from "./verification.js";
import banksRouter from "./banks.js";
import dashboardRouter from "./dashboard.js";
import profileRouter from "./profile.js";
import savingsBudgetsRouter from "./savings-budgets.js";
import aiRouter from "./ai.js";
import esiaRouter from "./esia.js";
import testRouter from "./test.js";
import configRouter from "./config.js";

// Создаем главный роутер
const mainRouter = Router();

// Подключаем базовые middleware для всех routes  
mainRouter.use(collectMetrics());
mainRouter.use(createHelmet()); // безопасные security headers
mainRouter.use(createCors()); // CORS для cross-origin запросов
mainRouter.use(queryOptimizationMiddleware); // Issue #6 FIX: Query optimization

// Подключаем специализированные роутеры  
// Auth с rate limiting для безопасности (5 попыток за 15 минут)
mainRouter.use('/auth', rateLimiters.auth, authRouter);

// Admin с агрессивным rate limiting (защита от брутфорса)
mainRouter.use('/admin', rateLimiters.auth, adminRouter);

// Documents и Verification с rate limiting
mainRouter.use('/documents', rateLimiters.general, documentsRouter);
mainRouter.use('/verification', rateLimiters.general, verificationRouter);

// Banks endpoints с коротким кэшем и rate limiting
mainRouter.use('/banks', rateLimiters.general, cache({ ttl: config.cache.banksTTL, cacheMethods: ['GET'] }), banksRouter);

// Dashboard с кэшированием и rate limiting
mainRouter.use('/dashboard', rateLimiters.general, cache({ ttl: config.cache.dashboardTTL, cacheMethods: ['GET'] }), dashboardRouter);

// Config endpoint с длительным кэшем и rate limiting
mainRouter.use('/config', rateLimiters.general, cache({ ttl: config.cache.configTTL, cacheMethods: ['GET'] }), configRouter);

// Profile и AI с rate limiting
mainRouter.use('/profile', rateLimiters.general, profileRouter);
mainRouter.use('/ai', rateLimiters.general, aiRouter);

// Savings-budgets с rate limiting
mainRouter.use('/', rateLimiters.general, savingsBudgetsRouter);

// ESIA OAuth с более мягким rate limiting (SSO требует больше запросов)
mainRouter.use('/auth/esia', rateLimiters.general, esiaRouter);

// Test endpoints с rate limiting (защита от зло использования)
mainRouter.use('/test', rateLimiters.general, testRouter);

export default mainRouter;