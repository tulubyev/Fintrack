import { useEffect, useState } from 'react';

interface DashboardMetrics {
  totalUsers: number;
  newUsersToday: number;
  activeConnections: number;
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
      <div style={{ backgroundColor: '#fff3cd', padding: '15px', borderRadius: '8px', border: '1px solid #ffeeba' }}>
        <h3 style={{ margin: '0 0 8px 0', color: '#856404', fontSize: '13px' }}>👥 Пользователи</h3>
        <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#856404' }} data-testid="stat-total-users">{value((m) => m.totalUsers)}</div>
        <p style={{ color: '#856404', fontSize: '12px', margin: 0 }}>Новых сегодня: {value((m) => m.newUsersToday)}</p>
      </div>

      <div style={{ backgroundColor: '#d4edda', padding: '15px', borderRadius: '8px', border: '1px solid #c3e6cb' }}>
        <h3 style={{ margin: '0 0 8px 0', color: '#155724', fontSize: '13px' }}>🏦 Банки</h3>
        <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#155724' }} data-testid="stat-active-connections">{value((m) => m.activeConnections)}</div>
        <p style={{ color: '#155724', fontSize: '12px', margin: 0 }}>Активных подключений</p>
      </div>

      <div style={{ backgroundColor: '#f8d7da', padding: '15px', borderRadius: '8px', border: '1px solid #f5c6cb' }}>
        <h3 style={{ margin: '0 0 8px 0', color: '#721c24', fontSize: '13px' }}>⚠️ Алерты</h3>
        <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#721c24' }}>
          {systemAlerts ? systemAlerts.summary.total : '...'}
        </div>
        <p style={{ color: '#721c24', fontSize: '12px', margin: 0 }}>
          {systemAlerts && systemAlerts.summary.high > 0 ? 
            `${systemAlerts.summary.high} критичных` : 
            'Требуют внимания'
          }
        </p>
      </div>

      <div style={{ backgroundColor: '#e2e3f3', padding: '15px', borderRadius: '8px', border: '1px solid #c2c5e8' }}>
        <h3 style={{ margin: '0 0 8px 0', color: '#4c5267', fontSize: '13px' }}>📄 Модерация</h3>
        <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#4c5267' }}>
          {isLoadingDocs ? '...' : pendingDocsCount}
        </div>
        <p style={{ color: '#4c5267', fontSize: '12px', margin: 0 }}>На проверку</p>
      </div>
    </div>
  );
}
