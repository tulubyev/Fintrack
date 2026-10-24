/**
 * Ссылки в приложение (E2.1-T6). Пути экранов повторяют сайт (/transactions, /budgets/:id, /accounts/:id…),
 * поэтому одна ссылка работает везде:
 * - fintrack://budgets/1 — схема приложения;
 * - https://fin-wall.ru/app/budgets/1 — App Links (Android) и Universal Links (iOS); без приложения сайт
 *   откроет ту же страницу (/app/… → /…);
 * - deepLink уведомлений — уже путь сайта: «/budgets/1».
 * Чужой домен открывает главную: ссылкой с другого сайта нельзя завести пользователя на произвольный путь.
 */

export const APP_LINK_HOSTS = ["fin-wall.ru", "www.fin-wall.ru"];
export const APP_LINK_PREFIX = "/app";

const withSlash = (path: string) => (path.startsWith("/") ? path : `/${path}`);

/** Путь экрана из входящей ссылки. */
export function toAppPath(input: string): string {
  const link = input.trim();
  let path: string;

  const web = link.match(/^https?:\/\/([^/?#]+)(.*)$/i);
  const scheme = link.match(/^[a-z][a-z0-9+.-]*:\/\/[^/]*(.*)$/i);
  if (web) {
    const host = web[1].toLowerCase().replace(/:\d+$/, "");
    if (!APP_LINK_HOSTS.includes(host)) return "/";
    path = web[2] || "/";
  } else if (link.toLowerCase().startsWith("fintrack:")) {
    // fintrack://budgets/1 — «budgets» стоит на месте хоста; fintrack:///budgets/1 — пустой хост
    path = link.replace(/^fintrack:\/*/i, "/");
  } else if (scheme) {
    // exp://192.168.1.10:8081/--/budgets/1 — Expo Go при разработке
    path = scheme[1] || "/";
  } else {
    path = link;
  }

  path = withSlash(path).replace(/^\/--(?=\/|$)/, "");
  if (path === APP_LINK_PREFIX || path.startsWith(`${APP_LINK_PREFIX}/`) || path.startsWith(`${APP_LINK_PREFIX}?`)) {
    path = path.slice(APP_LINK_PREFIX.length);
  }
  path = withSlash(path).replace(/\/{2,}/g, "/");
  return path === "" ? "/" : path;
}
