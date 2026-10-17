import { Router } from "express";
import { collectMetrics, createHelmet, createCors, cache, rateLimiters } from "../middleware";
import { queryOptimizationMiddleware } from "../middleware/queryOptimization";
import { config } from "../../config/environment";
import authRouter from "./auth.js";
import adminRouter from "./admin.js";
import documentsRouter from "./documents.js";
import verificationRouter from "./verification.js";
import financeRouter from "./finance.js";
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

// Счета и операции всегда проходят аутентификацию в роутере до формирования ответа.
// Не кэшируем их на уровне группы маршрутов: cache middleware не видит user identity.
// Подключение банков удалено до E3.5 (решение D15).
mainRouter.use(financeRouter); // лимитер — на самих маршрутах, чтобы не считать чужие запросы

// Dashboard содержит пользовательские финансовые данные и не должен обходить auth на cache hit.
mainRouter.use('/dashboard', rateLimiters.general, dashboardRouter);

// Config endpoint с длительным кэшем и rate limiting
mainRouter.use('/config', rateLimiters.general, cache({ ttl: config.cache.configTTL }), configRouter);

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