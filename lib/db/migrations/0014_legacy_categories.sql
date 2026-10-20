-- E1.3-T3: строковые категории v1 (transactions.category, budgets.category) → справочник категорий.
-- Строки писал прежний bankService по ключевым словам: «продукты», «транспорт», «рестораны», «развлечения», «коммуналка»,
-- «зарплата», «переводы», «прочее». Словарь соответствий — из спецификации E1.3; остальное ищется по названию категории
-- того же вида (системной, потом своей). Повторный запуск ничего не меняет. Старые колонки остаются до конца этапа 1.

-- Операции: только расходы и доходы без категории; вид категории совпадает с типом операции (доход с категорией
-- расходов означал бы возврат). Источник — keyword: так их и проставлял bankService, автоматика может уточнить.
UPDATE "transactions" t SET "category_id" = m."category_id", "category_source" = 'keyword', "updated_at" = now()
FROM (
  SELECT t2."id", (
    SELECT c."id" FROM "categories" c
    WHERE c."deleted_at" IS NULL AND c."kind" = t2."type"
      AND (c."code" = l."code" OR (lower(c."name") = lower(btrim(t2."category")) AND (c."user_id" IS NULL OR c."user_id" = t2."user_id")))
    ORDER BY (c."code" IS NOT DISTINCT FROM l."code") DESC, (c."user_id" IS NULL) DESC, (c."parent_id" IS NULL) DESC
    LIMIT 1
  ) AS "category_id"
  FROM "transactions" t2
  LEFT JOIN LATERAL (
    SELECT CASE t2."type" WHEN 'expense' THEN v."expense_code" ELSE v."income_code" END AS "code"
    FROM (VALUES
      ('продукты', 'food', NULL), ('транспорт', 'transport', NULL), ('рестораны', 'eat', NULL), ('развлечения', 'leisure', NULL),
      ('коммуналка', 'home.utilities', NULL), ('покупки', 'shopping', NULL), ('здоровье', 'health', NULL), ('образование', 'education', NULL),
      ('зарплата', NULL, 'inc.salary'), ('переводы', 'p2p', 'inc.p2p'), ('прочее', 'other', 'inc.other')
    ) AS v("legacy", "expense_code", "income_code")
    WHERE v."legacy" = lower(btrim(t2."category"))
  ) l ON true
  WHERE t2."category_id" IS NULL AND t2."category_source" = 'none' AND t2."type" IN ('expense', 'income')
    AND btrim(coalesce(t2."category", '')) <> ''
) m
WHERE t."id" = m."id" AND m."category_id" IS NOT NULL;--> statement-breakpoint

-- Бюджеты: 0006 искала категорию только по названию и для «рестораны», «коммуналка» и т. п. завела свои категории.
-- Переносим такие бюджеты на системную категорию из словаря, если у пользователя нет пересекающегося бюджета на ней.
UPDATE "budgets" b SET "category_id" = s."id", "updated_at" = now()
FROM "categories" own,
  (VALUES
    ('продукты', 'food'), ('транспорт', 'transport'), ('рестораны', 'eat'), ('развлечения', 'leisure'), ('коммуналка', 'home.utilities'),
    ('покупки', 'shopping'), ('здоровье', 'health'), ('образование', 'education'), ('переводы', 'p2p'), ('прочее', 'other')
  ) AS v("legacy", "code"),
  "categories" s
WHERE b."deleted_at" IS NULL AND own."id" = b."category_id" AND own."user_id" = b."user_id"
  AND v."legacy" = lower(btrim(b."category")) AND lower(own."name") = v."legacy"
  AND s."code" = v."code" AND s."deleted_at" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "budgets" o
    WHERE o."deleted_at" IS NULL AND o."user_id" = b."user_id" AND o."category_id" = s."id"
      AND o."effective_from" <= coalesce(b."effective_to", 'infinity'::date)
      AND coalesce(o."effective_to", 'infinity'::date) >= b."effective_from"
  );--> statement-breakpoint

-- Опустевшие категории, которые завела 0006: названы строкой v1 в нижнем регистре (человек пишет с заглавной),
-- без подкатегорий, операций, бюджетов и регулярных платежей.
UPDATE "categories" c SET "deleted_at" = now(), "updated_at" = now()
WHERE c."user_id" IS NOT NULL AND c."deleted_at" IS NULL AND c."parent_id" IS NULL
  AND c."name" IN ('продукты', 'транспорт', 'рестораны', 'развлечения', 'коммуналка', 'покупки', 'здоровье', 'образование', 'зарплата', 'переводы', 'прочее')
  AND NOT EXISTS (SELECT 1 FROM "categories" ch WHERE ch."parent_id" = c."id" AND ch."deleted_at" IS NULL)
  AND NOT EXISTS (SELECT 1 FROM "transactions" t WHERE t."category_id" = c."id" AND t."deleted_at" IS NULL)
  AND NOT EXISTS (SELECT 1 FROM "budgets" b WHERE b."deleted_at" IS NULL AND (b."category_id" = c."id" OR c."id" = ANY (b."excluded_category_ids")))
  AND NOT EXISTS (SELECT 1 FROM "recurring_series" r WHERE r."category_id" = c."id");
