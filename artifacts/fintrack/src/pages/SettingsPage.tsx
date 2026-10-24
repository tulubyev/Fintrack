import { ProfileSection } from '@/components/ProfileSection';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAuth } from '@/hooks/useAuth';

export function SettingsPage() {
  const { user, updateUser } = useAuth();
  return (
    <>
      <PageHeader title="Настройки" description="Профиль, верификация, документы, безопасность и уведомления" />
      <ProfileSection user={user} onUserUpdate={updateUser} />
    </>
  );
}
