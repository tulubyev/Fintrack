import { ProfileSection } from '@/components/ProfileSection';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { THEME_OPTIONS, useThemePref } from '@/lib/theme';

/** Тема: светлая, тёмная, кремовая или как в системе; выбор хранится в этом браузере. */
function AppearanceSection() {
  const theme = useThemePref();
  return (
    <section className="mb-6 rounded-xl border bg-card p-4 shadow-raised">
      <h2 className="font-semibold">Оформление</h2>
      <p className="mt-1 text-sm text-muted-foreground">Тема сохраняется в этом браузере.</p>
      <div role="radiogroup" aria-label="Тема" className="mt-3 flex flex-wrap gap-2">
        {THEME_OPTIONS.map((option) => (
          <Button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={theme.pref === option.value}
            variant={theme.pref === option.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => theme.setPref(option.value)}
            data-testid={`settings-theme-${option.value}`}
          >
            {option.label}
          </Button>
        ))}
      </div>
    </section>
  );
}

export function SettingsPage() {
  const { user, updateUser } = useAuth();
  return (
    <>
      <PageHeader title="Настройки" description="Оформление, профиль, верификация, документы, безопасность и уведомления" />
      <AppearanceSection />
      <ProfileSection user={user} onUserUpdate={updateUser} />
    </>
  );
}
