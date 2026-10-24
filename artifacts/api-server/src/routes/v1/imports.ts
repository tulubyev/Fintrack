import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { z } from "zod";
import { authenticateToken } from "../../middleware/auth";
import { ApiError, sendError } from "../../lib/apiError";
import {
  cancelImport, commitImport, decideRows, getImport, listImportRows, listImports, MAX_FILE_BYTES, setMapping, undoImport, uploadImport,
} from "../../services/imports/importService";
import { ACCOUNT_KINDS, IMPORT_ROW_STATUSES } from "@shared/schema";
import { sendValidationError } from "../../lib/apiError";
import { handle, pathId, queryList } from "./common";

/**
 * Импорт выписок (E1.2): POST /api/v1/imports (multipart: file, accountId?, institutionCode?) → 202,
 * GET /, GET /:id (опрос статуса), GET /:id/rows, PUT /:id/mapping (T5), PATCH /:id/rows (решения по строкам),
 * POST /:id/commit (T14, 202 — сохраняет воркер), POST /:id/undo (30 дней), DELETE /:id (до коммита).
 */
export const importsRouter = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: 10 } });

const fieldsSchema = z.object({
  accountId: z.string().uuid("Счёт не найден").optional(),
  institutionCode: z.string().regex(/^[a-z_]{2,30}$/, "Код банка — латиницей").optional(),
}).strip();

const column = z.string().trim().min(1).max(200);
const mappingSchema = z.object({
  mapping: z.object({
    date: column,
    description: column,
    amount: column.optional(),
    income: column.optional(),
    expense: column.optional(),
    currency: column.optional(),
    mcc: column.optional(),
    category: column.optional(),
    dateFormat: z.enum(["DD.MM.YYYY", "DD.MM.YY", "YYYY-MM-DD", "DD/MM/YYYY", "MM/DD/YYYY"]).optional(),
    signConvention: z.enum(["signed", "split", "expense_positive"]),
    defaultCurrency: z.string().regex(/^[A-Z]{3}$/).optional(),
  }).strict()
    .refine((mapping) => mapping.signConvention === "split" ? Boolean(mapping.income && mapping.expense) : Boolean(mapping.amount), "Выберите колонку суммы или колонки прихода и расхода"),
  remember: z.boolean().default(true),
}).strict();

const decisionsSchema = z.object({
  decisions: z.array(z.object({
    rowId: z.string().uuid(),
    decision: z.enum(["import", "skip", "merge"]).optional(),
    categoryId: z.string().uuid().nullable().optional(),
  }).strict()).min(1).max(500),
}).strict();

const commitSchema = z.object({
  accountId: z.string().uuid().optional(),
  createAccount: z.object({
    name: z.string().trim().min(1, "Введите название счёта").max(100),
    kind: z.enum(ACCOUNT_KINDS),
    institutionCode: z.string().regex(/^[a-z_]{2,30}$/).nullable().optional(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    lastFour: z.string().regex(/^\d{4}$/).nullable().optional(),
  }).strict().optional(),
}).strict().refine((body) => Boolean(body.accountId) !== Boolean(body.createAccount), "Укажите счёт или данные нового счёта — что-то одно");

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

importsRouter.put("/:id/mapping", handle(async (req, res) => {
  const id = importId(req);
  const parsed = mappingSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  res.status(202).json(await setMapping(req.user.id, id, parsed.data.mapping, parsed.data.remember));
}));

importsRouter.patch("/:id/rows", handle(async (req, res) => {
  const id = importId(req);
  const parsed = decisionsSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  res.json(await decideRows(req.user.id, id, parsed.data.decisions));
}));

importsRouter.post("/:id/commit", handle(async (req, res) => {
  const id = importId(req);
  const parsed = commitSchema.safeParse(req.body ?? {});
  if (!parsed.success) return sendValidationError(res, parsed.error);
  res.status(202).json(await commitImport(req.user.id, id, parsed.data));
}));

importsRouter.post("/:id/undo", handle(async (req, res) => {
  res.json(await undoImport(req.user.id, importId(req)));
}));
