import { createHash } from 'node:crypto';
import { toKopecks } from './numbers';

/**
 * Нормализованное описание для строгого ключа дедупликации (E1.2): нижний регистр, ё → е; без референсов и кодов
 * авторизации (6+ цифр подряд), масок карт (*1234, •• 1234, 1234 56** **** 7890), дат и времени внутри текста;
 * пробелы схлопнуты; первые 100 символов. Одна и та же операция в двух выписках одного формата даёт одну строку.
 */
export function normalizeDescription(description: string): string {
  return description
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\d{4}[\s-]?\d{0,2}[*xх•][\s*xх•-]*\d{4}/gi, ' ') // 4276 38** **** 1234
    .replace(/(?:[*•·]+\s*|карт[аеыу]?\s*[*•·]*\s*)\d{4}(?!\d)/gi, ' ') // *1234, •• 1234, карта *1234
    .replace(/\b\d{1,2}[./]\d{1,2}[./]\d{2,4}\b/g, ' ')
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ')
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, ' ')
    .replace(/\d{6,}/g, ' ')
    .replace(/[  \s]+/g, ' ')
    .trim()
    .slice(0, 100);
}

/** dedup_hash = sha256(account_id | дата | сумма в копейках | валюта | нормализованное описание). */
export function dedupHash(input: { accountId: string; date: string; amount: string; currency: string; description: string }): string {
  return createHash('sha256')
    .update([input.accountId, input.date, toKopecks(input.amount).toString(), input.currency, normalizeDescription(input.description)].join('|'))
    .digest('hex');
}

/**
 * dedup_seq — номер вхождения одинакового хеша внутри файла по порядку строк: две одинаковые покупки кофе за 250 ₽
 * в один день получают 1 и 2. Если в БД уже k операций с этим хешем, строки с seq ≤ k — дубли.
 */
export function dedupSequence(hashes: string[]): number[] {
  const seen = new Map<string, number>();
  return hashes.map((hash) => {
    const seq = (seen.get(hash) ?? 0) + 1;
    seen.set(hash, seq);
    return seq;
  });
}
