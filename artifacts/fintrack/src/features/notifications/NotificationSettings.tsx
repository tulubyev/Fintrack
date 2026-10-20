/**
 * «Уведомления» в настройках (D19, #93): письма о перерасходе бюджета, годовых подписках, конце пробного периода
 * и списании после отмены. Письма уходят только на подтверждённый e-mail.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { api, errorMessage } from '@/lib/api';

interface Settings {
  email: boolean;
  address: string | null;
  addressVerified: boolean;
}

const KEY = ['v1', 'notifications', 'settings'];

export function NotificationSettings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const settings = useQuery({ queryKey: KEY, queryFn: () => api<Settings>('/api/v1/notifications/settings') });
  const save = useMutation({
    mutationFn: (email: boolean) => api<Settings>('/api/v1/notifications/settings', { method: 'PATCH', body: { email } }),
    onSuccess: (data) => queryClient.setQueryData(KEY, data),
    onError: (error) => toast({ title: 'Не получилось', description: errorMessage(error), variant: 'destructive' }),
  });

  return (
    <section data-testid="notification-settings">
      <h2 className="text-lg font-semibold">Настройки уведомлений</h2>
      {settings.isPending ? <Skeleton className="mt-3 h-12" /> : settings.isError ? (
        <p className="mt-2 text-sm text-destructive">{errorMessage(settings.error)}</p>
      ) : (
        <>
          <label className="mt-3 flex items-start justify-between gap-4">
            <span className="flex gap-3">
              <Mail className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
              <span>
                <span className="block font-medium">Письма об уведомлениях</span>
                <span className="block text-sm text-muted-foreground">
                  Перерасход бюджета, годовая подписка, конец пробного периода и списание после отмены. Остальное — только в колокольчике.
                </span>
              </span>
            </span>
            <Switch
              checked={settings.data.email}
              onCheckedChange={(value) => save.mutate(value)}
              disabled={save.isPending}
              aria-label="Письма об уведомлениях"
              data-testid="email-notifications"
            />
          </label>
          {settings.data.email && (!settings.data.address || !settings.data.addressVerified) && (
            <p className="mt-3 text-sm text-warning" data-testid="email-unverified">
              {settings.data.address ? `Подтвердите e-mail ${settings.data.address} на вкладке «Верификация» — до этого письма не отправляются.` : 'Добавьте e-mail в профиле и подтвердите его на вкладке «Верификация» — до этого письма не отправляются.'}
            </p>
          )}
        </>
      )}
    </section>
  );
}
