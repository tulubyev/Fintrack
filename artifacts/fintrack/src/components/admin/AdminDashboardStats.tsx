import { useEffect, useState } from 'react';

interface DashboardMetrics {
  totalUsers: number;
  newUsersToday: number;
}

interface SystemAlerts {
  summary: {
    total: number;
    high: number;
    medium: number;
  };
}

interface AdminDashboardStatsProps {
  pendingDocsCount: number;
  systemAlerts: SystemAlerts | null;
  isLoadingDocs: boolean;
}

export function AdminDashboardStats({ 
  pendingDocsCount, 
  systemAlerts,
  isLoadingDocs
}: AdminDashboardStatsProps) {
  // null — ещё грузится, false — нет прав или ошибка
  const [metrics, setMetrics] = useState<DashboardMetrics | null | false>(null);

  useEffect(() => {
    fetch('/api/admin/dashboard/metrics', { headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` } })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setMetrics)
      .catch(() => setMetrics(false));
  }, []);

  const value = (pick: (m: DashboardMetrics) => number) =>
    metrics === null ? '...' : metrics === false ? '—' : pick(metrics).toLocaleString('ru-RU');

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '15px', marginBottom: '20px' }}>
      <div style={{ backgroundColor: 'var(--warning-subtle)', padding: '15px', borderRadius: '8px', border: '1px solid var(--warning-subtle)' }}>
        <h3 style={{ margin: '0 0 8px 0', color: 'var(--warning)', fontSize: '13px' }}>👥 Пользователи</h3>
        <div style={{ fontSize: '24px', fontWeight: 'bold', color: 'var(--warning)' }} data-testid="stat-total-users">{value((m) => m.totalUsers)}</div>
        <p style={{ color: 'var(--warning)', fontSize: '12px', margin: 0 }}>Новых сегодня: {value((m) => m.newUsersToday)}</p>
      </div>

      <div style={{ backgroundColor: 'var(--destructive-subtle)', padding: '15px', borderRadius: '8px', border: '1px solid var(--destructive-subtle)' }}>
        <h3 style={{ margin: '0 0 8px 0', color: 'var(--destructive)', fontSize: '13px' }}>⚠️ Алерты</h3>
        <div style={{ fontSize: '24px', fontWeight: 'bold', color: 'var(--destructive)' }}>
          {systemAlerts ? systemAlerts.summary.total : '...'}
        </div>
        <p style={{ color: 'var(--destructive)', fontSize: '12px', margin: 0 }}>
          {systemAlerts && systemAlerts.summary.high > 0 ? 
            `${systemAlerts.summary.high} критичных` : 
            'Требуют внимания'
          }
        </p>
      </div>

      <div style={{ backgroundColor: 'var(--brand-accent-subtle)', padding: '15px', borderRadius: '8px', border: '1px solid var(--brand-accent-subtle)' }}>
        <h3 style={{ margin: '0 0 8px 0', color: 'var(--foreground)', fontSize: '13px' }}>📄 Модерация</h3>
        <div style={{ fontSize: '24px', fontWeight: 'bold', color: 'var(--foreground)' }}>
          {isLoadingDocs ? '...' : pendingDocsCount}
        </div>
        <p style={{ color: 'var(--foreground)', fontSize: '12px', margin: 0 }}>На проверку</p>
      </div>
    </div>
  );
}
