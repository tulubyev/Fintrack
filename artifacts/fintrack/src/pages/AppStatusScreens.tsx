import { WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

/** Пока сервер проверяет сессию: контур каркаса вместо спиннера. */
export function AppSkeleton() {
  return (
    <div className="min-h-screen bg-background" aria-busy="true" aria-label="Загрузка" data-testid="app-skeleton">
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col gap-3 border-r bg-sidebar p-5 md:flex">
        <Skeleton className="mb-4 h-8 w-32" />
        {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-8 w-full" />)}
      </aside>
      <div className="md:pl-60">
        <div className="flex h-16 items-center justify-end border-b px-4 md:px-8"><Skeleton className="size-8 rounded-full" /></div>
        <div className="mx-auto max-w-6xl space-y-6 px-4 pt-6 md:px-8">
          <Skeleton className="h-8 w-56" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28" />)}
          </div>
          <Skeleton className="h-72" />
        </div>
      </div>
    </div>
  );
}

/** Сервер недоступен при старте: из аккаунта не выкидываем, предлагаем повторить. */
export function OfflineScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center" data-testid="offline-screen">
      <WifiOff className="size-10 text-muted-foreground" aria-hidden />
      <div>
        <h1 className="text-xl font-semibold">Нет соединения</h1>
        <p className="mt-1 text-sm text-muted-foreground">Не удалось связаться с сервером. Проверьте интернет и попробуйте ещё раз.</p>
      </div>
      <Button onClick={onRetry}>Повторить</Button>
    </div>
  );
}
