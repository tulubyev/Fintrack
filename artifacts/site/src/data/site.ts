/** Общие адреса и тексты сайта. Адрес приложения задаётся при сборке (PUBLIC_APP_URL), по умолчанию — app.fin-wall.ru (D21). */
export const APP_URL = (import.meta.env.PUBLIC_APP_URL ?? 'https://app.fin-wall.ru').replace(/\/+$/, '');
export const SITE_NAME = 'FinTrack';
export const SITE_DESCRIPTION = 'Все счета и траты в одном месте: выписки любых банков, бюджеты, подписки и цели. Без рекламы банковских продуктов.';

export const NAV = [
  { href: '/security', label: 'Безопасность' },
  { href: '/banks', label: 'Банки и выписки' },
  { href: '/mobile', label: 'Приложение' },
  { href: '/help', label: 'Вопросы' },
] as const;

export const LEGAL = [
  { href: '/legal/privacy', label: 'Политика обработки персональных данных' },
  { href: '/legal/terms', label: 'Пользовательское соглашение' },
  { href: '/legal/consent', label: 'Согласие на обработку персональных данных' },
] as const;
