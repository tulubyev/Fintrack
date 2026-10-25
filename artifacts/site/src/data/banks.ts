/**
 * Страницы банков (E1.8-T4). Шаги, статус и форматы — из общего модуля @workspace/shared/bank-guides, его же читает
 * мастер импорта: здесь только то, что нужно сайту (падежи для заголовков, описания для поиска).
 */
import { BANK_GUIDES, type BankGuide, type BankImportStatus } from '@workspace/shared/bank-guides';
import { APP_URL, SITE_NAME } from './site';

/** Родительный падеж: «Как скачать выписку Т-Банка». */
const GENITIVE: Record<string, string> = {
  tbank: 'Т-Банка',
  sber: 'Сбербанка',
  alfa: 'Альфа-Банка',
  vtb: 'ВТБ',
  ozon: 'Озон Банка',
  yandex: 'Яндекс Банка',
  other: 'любого банка',
};

export const STATUS_TEXT: Record<BankImportStatus, string> = {
  auto: 'Выписку распознаём сами: загрузите файл — и сразу к проверке операций.',
  mapping: 'Отдельного разбора пока нет: при первой загрузке укажете, где дата, сумма и описание. Следующие файлы распознаются сами.',
  soon: 'Этот формат мы пока не читаем — научимся в ближайших обновлениях.',
};

export interface BankPage extends BankGuide {
  genitive: string;
  title: string;
  description: string;
  importUrl: string;
}

export const BANK_PAGES: BankPage[] = BANK_GUIDES.map((guide) => {
  const genitive = GENITIVE[guide.code] ?? guide.name;
  return {
    ...guide,
    genitive,
    title: `Как скачать выписку ${genitive}`,
    description: guide.formats.length
      ? `Пошаговая инструкция: как скачать выписку ${genitive} в формате ${guide.formats.join(' или ')} и загрузить её в ${SITE_NAME}, чтобы увидеть траты по категориям.`
      : `Пошаговая инструкция: как скачать выписку ${genitive}. Читать её ${SITE_NAME} научится в ближайших обновлениях.`,
    importUrl: `${APP_URL}/import?bank=${encodeURIComponent(guide.code)}`,
  };
});

const ORDER: BankImportStatus[] = ['auto', 'mapping', 'soon'];
/** Для списка: сначала банки, которые читаем, затем «скоро»; «другой банк» — отдельной карточкой. */
export const BANKS_SORTED = BANK_PAGES.filter((bank) => bank.code !== 'other').sort(
  (a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status),
);
export const OTHER_BANK = BANK_PAGES.find((bank) => bank.code === 'other')!;
