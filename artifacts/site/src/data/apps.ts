/**
 * Где скачать приложение (E1.8-T5). Ссылки публичные, поэтому живут в коде, а не в окружении: опубликовали в магазине —
 * вписали ссылку отдельным PR. null — магазина пока нет, страница честно пишет «скоро» и не ставит пустых ссылок.
 * APK: url и sha256 меняются вместе с каждым выпуском (sha256sum файла из mobile-android.yml).
 */
export interface StoreLink {
  name: string;
  note: string;
  url: string | null;
  /** Подпись кнопки, если не «Скачать». */
  cta?: string;
}

export const ANDROID: { stores: StoreLink[]; apk: { url: string | null; sha256: string | null; version: string | null } } = {
  stores: [
    { name: 'RuStore', note: 'Российский магазин приложений', url: null },
    { name: 'Google Play', note: 'Если пользуетесь Google Play', url: null },
  ],
  apk: { url: null, sha256: null, version: null },
};

export const IOS: StoreLink[] = [
  { name: 'TestFlight', note: 'Бета-версия по приглашению — первыми получаете обновления', url: null, cta: 'Присоединиться' },
  { name: 'App Store', note: 'После беты', url: null },
];

export const APP_FEATURES: string[] = [
  'Счета, операции, бюджеты, цели и подписки — те же, что в веб-версии, синхронизируются сами.',
  'Работает без сети: добавленные операции отправятся, когда появится интернет.',
  'Быстрое добавление траты в пару касаний.',
  'Загрузка выписки из файла, а на Android — прямо через «Поделиться» в приложении банка.',
  'Вход по PIN-коду, данные на телефоне в зашифрованной базе, блокировка после 5 минут в фоне.',
];

export const hasAnyStore = [...ANDROID.stores, ...IOS].some((store) => store.url) || Boolean(ANDROID.apk.url);
