// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

/**
 * Публичный сайт fin-wall.ru (E1.8): статический HTML без JavaScript по умолчанию. Приложение живёт на app.fin-wall.ru (D21).
 * Сборка — в web-образе вместе с SPA, раздаёт тот же nginx по имени хоста.
 */
export default defineConfig({
  site: 'https://fin-wall.ru',
  output: 'static',
  trailingSlash: 'never',
  build: { format: 'file' }, // /security → security.html: nginx отдаёт без завершающего слеша
  integrations: [sitemap({ filter: (page) => !page.includes('/404') })],
  vite: { plugins: [tailwindcss()] },
});
