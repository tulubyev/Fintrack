import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { z } from "zod";
import { authenticateToken } from "../../middleware/auth";
import { ApiError, sendError } from "../../lib/apiError";
import { cancelImport, getImport, listImportRows, listImports, MAX_FILE_BYTES, uploadImport } from "../../services/imports/importService";
import { IMPORT_ROW_STATUSES } from "@shared/schema";
import { handle, pathId, queryList } from "./common";

/**
 * Импорт выписок (E1.2-T4): POST /api/v1/imports (multipart: file, accountId?, institutionCode?) → 202,
 * GET /, GET /:id (опрос статуса), GET /:id/rows, DELETE /:id (до коммита). Сопоставление, решения по строкам,
 * коммит и отмена — следующие задачи эпика.
 */
export const importsRouter = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: 10 } });

const fieldsSchema = z.object({
  accountId: z.string().uuid("Счёт не найден").optional(),
  institutionCode: z.string().regex(/^[a-z_]{2,30}$/, "Код банка — латиницей").optional(),
}).strip();

const importId = (req: Parameters<typeof pathId>[0]) => pathId(req, "Импорт не найден");

function limit(value: unknown, fallback: number, max: number): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) throw new ApiError(400, "VALIDATION_ERROR", `limit — от 1 до ${max}`);
  return parsed;
}

/** Ошибки multer — в формат v1: большой файл — 413, прочее — 400. */
function receiveFile(req: Request, res: Response, next: NextFunction) {
  upload.single("file")(req, res, (error: unknown) => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      return sendError(res, 413, "FILE_TOO_LARGE", "Файл больше 15 МБ. Скачайте выписку за меньший период.");
    }
    return sendError(res, 400, "VALIDATION_ERROR", "Загрузите один файл в поле file");
  });
}

importsRouter.use(authenticateToken);

importsRouter.post("/", receiveFile, handle(async (req, res) => {
  const file = (req as Request).file;
  if (!file?.buffer?.length) throw new ApiError(400, "VALIDATION_ERROR", "Выберите файл выписки");
  const fields = fieldsSchema.safeParse(req.body ?? {});
  if (!fields.success) {
    // некорректный id счёта — тот же ответ, что и чужой счёт
    if (fields.error.issues.some((issue) => issue.path[0] === "accountId")) throw new ApiError(404, "NOT_FOUND", "Счёт не найден");
    throw new ApiError(400, "VALIDATION_ERROR", fields.error.issues[0]?.message ?? "Некорректный запрос");
  }
  // multer отдаёт имя в latin1 — восстанавливаем UTF-8, иначе кириллица в имени файла превращается в кракозябры
  const fileName = Buffer.from(file.originalname, "latin1").toString("utf8");
  res.status(202).json(await uploadImport(req.user.id, { fileName, bytes: file.buffer, ...fields.data }));
}));

importsRouter.get("/", handle(async (req, res) => {
  const cursor = typeof req.query.cursor === "string" && req.query.cursor ? req.query.cursor : undefined;
  res.json(await listImports(req.user.id, { limit: limit(req.query.limit, 20, 100), cursor }));
}));

importsRouter.get("/:id", handle(async (req, res) => {
  res.json(await getImport(req.user.id, importId(req)));
}));

importsRouter.get("/:id/rows", handle(async (req, res) => {
  const id = importId(req);
  const status = queryList(req.query.status);
  if (status?.some((value) => !(IMPORT_ROW_STATUSES as readonly string[]).includes(value))) {
    throw new ApiError(400, "VALIDATION_ERROR", `status — из ${IMPORT_ROW_STATUSES.join(", ")}`);
  }
  let cursor: number | undefined;
  if (typeof req.query.cursor === "string" && req.query.cursor) {
    cursor = Number(req.query.cursor);
    if (!Number.isInteger(cursor) || cursor < 0) throw new ApiError(400, "VALIDATION_ERROR", "Некорректный курсор");
  }
  res.json(await listImportRows(req.user.id, id, { limit: limit(req.query.limit, 100, 500), cursor, status }));
}));

importsRouter.delete("/:id", handle(async (req, res) => {
  await cancelImport(req.user.id, importId(req));
  res.status(204).end();
}));
