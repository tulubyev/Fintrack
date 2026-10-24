-- Подкатегории доходов (#79): пенсию, пособия, стипендию и алименты учитываем отдельно от зарплаты.
-- Дерево двухуровневое, поэтому это соседи inc.gov, а не его дети; inc.gov остаётся для прочих выплат государства.
-- Коды неизменяемы. Повторный запуск ничего не меняет.
INSERT INTO categories (parent_id, code, name, kind, sort_order)
SELECT p.id, c.code, c.name, 'income', c.sort_order
FROM (VALUES
  ('inc.pension', 'Пенсия', 22),
  ('inc.benefits', 'Пособия и соцвыплаты', 24),
  ('inc.stipend', 'Стипендия', 26),
  ('inc.alimony', 'Алименты', 28)
) AS c(code, name, sort_order)
JOIN categories p ON p.code = 'inc'
ON CONFLICT (code) DO NOTHING;
--> statement-breakpoint
UPDATE categories SET name = 'Другие выплаты от государства', updated_at = now() WHERE code = 'inc.gov' AND name = 'Выплаты от государства';
