import type { Express } from "express";
import { rateLimiters } from "./middleware";

// Все маршруты — в модульном роутере routes/index.ts (auth, admin, documents, profile, …)
export async function registerRoutes(app: Express): Promise<void> {
  // Общий лимит на весь /api: RATE_LIMIT_MODERATE_* (по умолчанию 100 запросов в минуту)
  app.use('/api', rateLimiters.moderate);

  const mainRouter = await import('./routes/index.js');
  app.use('/api', mainRouter.default);
}
