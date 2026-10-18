import { Router, type Response } from "express";
import { z } from "zod";
import { authenticateToken, type AuthenticatedRequest } from "../middleware/auth";
import { CATEGORY_KINDS, listCategoryTree } from "../services/categoryService";
import { logger } from "../services/logger";

/** GET /api/v1/categories — дерево категорий за один запрос (E1.3-T1). */
const router = Router();

const querySchema = z.object({
  kind: z.enum(CATEGORY_KINDS).optional(),
  includeHidden: z.enum(["true", "false"]).optional().transform((value) => value === "true"),
});

router.get("/", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Некорректные параметры", details: parsed.error.flatten() } });
  }
  try {
    res.json({ items: await listCategoryTree(req.user.id, parsed.data) });
  } catch (error) {
    logger.error("Не удалось получить категории:", error);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Не удалось получить категории" } });
  }
});

export default router;
