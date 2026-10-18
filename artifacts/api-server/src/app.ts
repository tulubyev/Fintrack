import express, { type Express, type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { logger } from "./services/logger";

// Приложение без listen: сервер поднимает index.ts, тесты — supertest
export async function createApp(): Promise<Express> {
  const app = express();
  app.set('trust proxy', 1); // Trust first proxy for rate limiting
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  const log = (message: string) => logger.info(message);

  // Workspace service health check. Existing product endpoints remain unchanged.
  app.get("/api/healthz", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;
    let capturedJsonResponse: Record<string, any> | undefined = undefined;

    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };

    res.on("finish", () => {
      const duration = Date.now() - start;
      if (path.startsWith("/api")) {
        let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
        if (capturedJsonResponse) {
          logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
        }

        if (logLine.length > 80) {
          logLine = logLine.slice(0, 79) + "…";
        }

        log(logLine);
      }
    });

    next();
  });

  await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  return app;
}
