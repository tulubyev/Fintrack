import { useState } from 'react';
import { useLocation } from 'wouter';
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { api, ApiRequestError, errorMessage } from '@/lib/api';

/**
 * «Удалить аккаунт» (E1.0-T6, 152-ФЗ): DELETE /api/v1/me с паролем стирает все данные пользователя, включая файлы.
 * Тот же путь — для отзыва согласия на обработку ПДн.
 */
export function DeleteAccountSection() {
  const { logout } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await api('/api/v1/me', { method: 'DELETE', body: { password } });
      await logout();
      toast({ title: 'Аккаунт удалён', description: 'Все ваши данные стёрты.' });
      navigate('/login', { replace: true });
    } catch (failure) {
      setError(failure instanceof ApiRequestError && failure.status === 403 ? 'Неверный пароль' : errorMessage(failure));
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 rounded-xl border border-destructive/40 bg-card p-4 shadow-raised">
      <h2 className="font-semibold">Удаление аккаунта</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Удалятся счета, операции, бюджеты, цели, загруженные выписки и документы. Восстановить их будет нельзя.
      </p>
      <AlertDialog open={open} onOpenChange={(value) => { setOpen(value); if (!value) { setPassword(''); setError(null); } }}>
        <AlertDialogTrigger asChild>
          <Button variant="outline" size="sm" className="mt-3 border-destructive/50 text-destructive hover:bg-destructive-subtle hover:text-destructive" data-testid="delete-account">
            Удалить аккаунт
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить аккаунт навсегда?</AlertDialogTitle>
            <AlertDialogDescription>
              Мы сотрём все ваши данные: счета, операции, бюджеты, цели, выписки, документы и настройки. Вы выйдете на всех устройствах.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <form
            id="delete-account-form"
            className="space-y-2"
            onSubmit={(event) => { event.preventDefault(); if (password) void confirm(); }}
          >
            <Label htmlFor="delete-account-password">Пароль для подтверждения</Label>
            <Input
              id="delete-account-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'delete-account-error' : undefined}
              data-testid="delete-account-password"
            />
            {error && <p id="delete-account-error" className="text-sm text-destructive">{error}</p>}
          </form>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Отмена</AlertDialogCancel>
            <Button type="submit" form="delete-account-form" variant="destructive" disabled={!password || busy} data-testid="delete-account-confirm">
              {busy ? 'Удаляем…' : 'Удалить навсегда'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
