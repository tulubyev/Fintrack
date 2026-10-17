import type { Express } from "express";
import { createServer, type Server } from "http";
import rateLimit from "express-rate-limit";

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // limit each user to 100 requests per windowMs
  message: "Слишком много запросов, попробуйте позже",
  standardHeaders: true,
  legacyHeaders: false,
});

// Все маршруты — в модульном роутере routes/index.ts (auth, admin, banks, documents, profile, …)
export async function registerRoutes(app: Express): Promise<Server> {
  app.use('/api', apiLimiter);

  const mainRouter = await import('./routes/index.js');
  app.use('/api', mainRouter.default);

  return createServer(app);
}
