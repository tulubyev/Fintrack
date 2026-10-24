import type { DateFormat } from './types';

/**
 * Даты выписок → YYYY-MM-DD и HH:MM:SS. Форматы: дд.мм.гггг, дд.мм.гг, гггг-мм-дд, дд/мм/гггг, мм/дд/гггг (только явно),
 * с временем и без; серийные даты Excel (число дней от 1899-12-30, дробная часть — время).
 */
export function parseDateTime(input: string | number | null | undefined, format?: DateFormat): { date: string; time: string | null } | null {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number' || /^\d{5}(\.\d+)?$/.test(String(input).trim())) return fromExcelSerial(Number(input));
  const value = String(input).trim().replace(/\s+/g, ' ');
  if (!value) return null;

  let day: number, month: number, year: number;
  let rest: string;
  let match: RegExpMatchArray | null;
  if ((match = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](.*))?$/)) && (!format || format === 'YYYY-MM-DD')) {
    [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    rest = match[4] ?? '';
  } else if ((match = value.match(/^(\d{1,2})([./])(\d{1,2})\2(\d{2}|\d{4})(?:,? (.*))?$/))) {
    const usOrder = format === 'MM/DD/YYYY';
    [day, month] = usOrder ? [Number(match[3]), Number(match[1])] : [Number(match[1]), Number(match[3])];
    year = Number(match[4]);
    if (match[4].length === 2) year += year >= 70 ? 1900 : 2000;
    rest = match[5] ?? '';
  } else {
    return null;
  }
  if (!validDate(year, month, day)) return null;
  const time = parseTime(rest);
  if (rest && time === undefined) return null;
  return { date: `${year}-${pad(month)}-${pad(day)}`, time: time ?? null };
}

export function parseDate(input: string | number | null | undefined, format?: DateFormat): string | null {
  return parseDateTime(input, format)?.date ?? null;
}

function parseTime(value: string): string | null | undefined {
  if (!value) return null;
  const match = value.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/);
  if (!match) return undefined;
  const [h, m, s] = [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)];
  if (h > 23 || m > 59 || s > 59) return undefined;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function fromExcelSerial(serial: number): { date: string; time: string | null } | null {
  // разумный диапазон: 1954–2119; иначе это не дата, а сумма или номер
  if (!Number.isFinite(serial) || serial < 20_000 || serial > 80_000) return null;
  const days = Math.floor(serial);
  const seconds = Math.round((serial - days) * 86_400);
  const date = new Date(Date.UTC(1899, 11, 30) + days * 86_400_000);
  const time = seconds ? `${pad(Math.floor(seconds / 3600) % 24)}:${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}` : null;
  return { date: date.toISOString().slice(0, 10), time };
}

function validDate(year: number, month: number, day: number): boolean {
  if (year < 1970 || year > 2100 || month < 1 || month > 12 || day < 1) return false;
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Какой формат даты у колонки: первый, под который подходят все непустые значения. */
export function guessDateFormat(values: string[]): DateFormat | undefined {
  const sample = values.filter((value) => value.trim()).slice(0, 50);
  if (!sample.length) return undefined;
  const formats: DateFormat[] = ['DD.MM.YYYY', 'YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY'];
  return formats.find((format) => sample.every((value) => parseDateTime(value, format) !== null));
}
