/**
 * Как скачать выписку в банке — один источник для мастера импорта в вебе (E1.2-T15) и страниц банков на сайте (E1.8-T4).
 * Шаги — по открытым описаниям интерфейсов банков на 2025–2026 годы: банки меняют меню без предупреждения, тексты
 * сверяются при проверке форматов (E1.2-T2). Новый разбор в @workspace/statement-parsers — поменять status здесь.
 */

/** auto — формат банка распознаём сами; mapping — колонки выберете один раз; soon — формат банка пока не читаем. */
export type BankImportStatus = 'auto' | 'mapping' | 'soon';

export interface BankGuide {
  /** Код банка — как institutionCode счёта и адрес страницы /banks/<code> на сайте. */
  code: string;
  name: string;
  steps: string[];
  /** Какой файл лучше и почему; null — подходит любой из поддерживаемых. */
  recommended: string | null;
  status: BankImportStatus;
  /** Что из выгрузок банка можно загрузить уже сейчас. */
  formats: string[];
}

export const BANK_IMPORT_STATUS: Record<BankImportStatus, string> = {
  auto: 'Распознаём сами',
  mapping: 'Колонки выберете один раз',
  soon: 'Скоро',
};

export const BANK_GUIDES: BankGuide[] = [
  {
    code: 'tbank',
    name: 'Т-Банк',
    steps: ['Откройте веб-версию tbank.ru и войдите', 'Раздел «Операции» → выберите карту и период', 'Нажмите «Выгрузить» и выберите CSV или Excel'],
    recommended: 'Лучше CSV или Excel из веб-версии — в них есть MCC, и категории подберутся точнее.',
    status: 'auto',
    formats: ['CSV', 'Excel'],
  },
  {
    code: 'sber',
    name: 'Сбербанк',
    steps: ['СберБанк Онлайн → нужная карта', '«Выписки и справки» → «Выписка по счёту карты»', 'Выберите период и сохраните PDF'],
    recommended: 'PDF-выписки Сбера научимся читать в ближайшее время. Пока загрузите CSV или Excel, если они у вас есть.',
    status: 'soon',
    formats: [],
  },
  {
    code: 'alfa',
    name: 'Альфа-Банк',
    steps: ['Альфа-Онлайн в браузере → нужный счёт', '«Выписка» → период', 'Скачайте CSV или Excel'],
    recommended: 'Отдельного разбора Альфы пока нет: колонки выберете один раз, дальше файлы распознаются сами.',
    status: 'mapping',
    formats: ['CSV', 'Excel'],
  },
  {
    code: 'vtb',
    name: 'ВТБ',
    steps: ['ВТБ Онлайн → счёт или карта', '«Выписка» → период', 'Скачайте Excel, если он доступен'],
    recommended: 'Excel загрузите с выбором колонок; PDF ВТБ пока не читаем.',
    status: 'mapping',
    formats: ['Excel'],
  },
  {
    code: 'ozon',
    name: 'Озон Банк',
    steps: ['Приложение Ozon → Банк → карта', '«Выписка» или «Справка о движении средств»', 'Сохраните файл'],
    recommended: 'Озон Банк отдаёт выписку в PDF — его научимся читать позже.',
    status: 'soon',
    formats: [],
  },
  {
    code: 'yandex',
    name: 'Яндекс Банк',
    steps: ['Приложение Яндекс Пэй → счёт', '«Выписка» → период', 'Сохраните файл'],
    recommended: 'Яндекс Банк отдаёт выписку в PDF — его научимся читать позже.',
    status: 'soon',
    formats: [],
  },
  {
    code: 'other',
    name: 'Другой банк',
    steps: ['Скачайте выписку в интернет-банке', 'Выберите CSV или Excel (XLSX)', 'Загрузите файл и один раз укажите, где дата, сумма и описание'],
    recommended: null,
    status: 'mapping',
    formats: ['CSV', 'Excel'],
  },
];

export const bankGuide = (code: string | null | undefined): BankGuide | undefined =>
  code ? BANK_GUIDES.find((guide) => guide.code === code) : undefined;
