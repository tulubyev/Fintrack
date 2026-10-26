/**
 * Документы на публичном сайте (E1.8-T6). Абсолютные адреса: веб живёт на app.fin-wall.ru (D21), документы — на fin-wall.ru,
 * где они раздаются и до включения режима «сайт» (deploy/nginx.conf). Другой адрес сайта — VITE_SITE_URL при сборке.
 */
const SITE_URL = (import.meta.env.VITE_SITE_URL ?? 'https://fin-wall.ru').replace(/\/+$/, '');

export const LEGAL_URLS = {
  privacy: `${SITE_URL}/legal/privacy`,
  terms: `${SITE_URL}/legal/terms`,
  consent: `${SITE_URL}/legal/consent`,
} as const;
