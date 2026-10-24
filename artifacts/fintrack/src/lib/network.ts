import { toast } from '@/hooks/use-toast';

/** Сбой сети: fetch бросает TypeError, а не возвращает ответ с кодом. */
export const isNetworkError = (error: unknown) => error instanceof TypeError;

/** Тост при потере и восстановлении соединения; запросы TanStack Query повторятся сами. */
export function installNetworkStatus() {
  let lost: ReturnType<typeof toast> | null = null;
  window.addEventListener('offline', () => {
    lost = toast({ title: 'Нет соединения', description: 'Проверьте интернет — повторим запросы, когда сеть вернётся.', variant: 'destructive' });
  });
  window.addEventListener('online', () => {
    lost?.dismiss();
    lost = null;
    toast({ title: 'Соединение восстановлено' });
  });
}
