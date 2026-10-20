/**
 * Колокольчик в шапке (E1.0-T4): число непрочитанных, список с подгрузкой, клик — прочитано и переход по deepLink.
 * Обновляется раз в минуту и при возврате на вкладку.
 */
import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Bell, BellRing, CalendarClock, CheckCheck, Info, PartyPopper, PieChart, Repeat, Upload, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { api } from '@/lib/api';
import { track } from '@/lib/analytics';
import { cn } from '@/lib/utils';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  deepLink: string | null;
  readAt: string | null;
  createdAt: string;
}

interface Page {
  items: Notification[];
  nextCursor: string | null;
  unreadCount: number;
}

const ICONS: Record<string, LucideIcon> = {
  budget_threshold: PieChart,
  recurring_upcoming: CalendarClock,
  recurring_new: Repeat,
  recurring_after_cancel: AlertTriangle,
  import_done: Upload,
  goal_reached: PartyPopper,
  system: Info,
};

const KEY = ['v1', 'notifications'];

function timeAgo(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'только что';
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ч назад`;
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(new Date(iso));
}

// Показ считаем один раз за загрузку страницы на уведомление
const shown = new Set<string>();

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const query = useInfiniteQuery({
    queryKey: KEY,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => api<Page>('/api/v1/notifications', { query: { limit: 20, cursor: pageParam } }),
    getNextPageParam: (last) => last.nextCursor,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });

  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  const unread = query.data?.pages[0]?.unreadCount ?? 0;

  const readOne = useMutation({
    mutationFn: (id: string) => api<void>(`/api/v1/notifications/${id}/read`, { method: 'POST' }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
  const readAll = useMutation({
    mutationFn: () => api<void>('/api/v1/notifications/read-all', { method: 'POST' }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });

  useEffect(() => {
    if (!open) return;
    for (const item of items) {
      if (shown.has(item.id)) continue;
      shown.add(item.id);
      track('notification_shown', { type: item.type });
    }
  }, [open, items]);

  function openItem(item: Notification) {
    track('notification_clicked', { type: item.type });
    if (!item.readAt) readOne.mutate(item.id);
    setOpen(false);
    if (item.deepLink) navigate(item.deepLink);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative rounded-full" aria-label={unread ? `Уведомления: ${unread} новых` : 'Уведомления'} data-testid="notification-bell">
          {unread ? <BellRing className="size-5" /> : <Bell className="size-5" />}
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground" data-testid="notification-count">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" collisionPadding={16} className="w-[min(380px,calc(100vw-2rem))] p-0" data-testid="notification-panel">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="font-semibold">Уведомления</span>
          {unread > 0 && (
            <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => readAll.mutate()} disabled={readAll.isPending} data-testid="notification-read-all">
              <CheckCheck className="size-3.5" />Прочитать все
            </Button>
          )}
        </div>
        <div className="max-h-[min(420px,70vh)] overflow-y-auto">
          {query.isPending ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Загрузка…</p>
          ) : query.isError ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Не удалось загрузить уведомления</p>
          ) : items.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground" data-testid="notification-empty">
              Пока тихо. Здесь появятся предупреждения о бюджетах и списаниях
            </p>
          ) : (
            <ul className="divide-y">
              {items.map((item) => {
                const Icon = ICONS[item.type] ?? Info;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => openItem(item)}
                      className={cn('flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-muted', !item.readAt && 'bg-primary/5')}
                      data-testid="notification-item"
                    >
                      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{item.title}</span>
                        {item.body && <span className="mt-0.5 block text-xs text-muted-foreground">{item.body}</span>}
                        <span className="mt-1 block text-[11px] text-muted-foreground">{timeAgo(item.createdAt)}</span>
                      </span>
                      {!item.readAt && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-label="Не прочитано" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {query.hasNextPage && (
            <div className="border-t p-2 text-center">
              <Button variant="ghost" size="sm" onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}>
                {query.isFetchingNextPage ? 'Загружаем…' : 'Показать ещё'}
              </Button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
