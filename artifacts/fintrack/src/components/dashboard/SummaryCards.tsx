import { useEffect, useState } from 'react';

interface DashboardStats {
  totalBalance: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  totalSavings: number;
  savingsTarget: number;
  savingsGoalsCount: number;
}

export const formatRub = (value: number) =>
  new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(value);

const card = { backgroundColor: 'white', padding: '25px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' };

function Card({ title, icon, value, color, note, testId }: { title: string; icon: string; value: string; color: string; note: string; testId: string }) {
  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '15px' }}>
        <h3 style={{ margin: '0', color: '#495057', fontSize: '16px' }}>{title}</h3>
        <span style={{ fontSize: '24px' }}>{icon}</span>
      </div>
      <div style={{ fontSize: '32px', fontWeight: 'bold', color, marginBottom: '5px' }} data-testid={testId}>{value}</div>
      <p style={{ margin: '0', color: '#6c757d', fontSize: '14px' }}>{note}</p>
    </div>
  );
}

// Итоги по данным пользователя: счета, операции текущего месяца, цели накоплений
export function SummaryCards() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch('/api/dashboard/stats', { headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` } })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setStats)
      .catch(() => setError(true));
  }, []);

  const show = (pick: (s: DashboardStats) => number) => (stats ? formatRub(pick(stats)) : error ? '—' : '…');
  const month = new Date().toLocaleString('ru-RU', { month: 'long' });

  return (
    <div style={{ marginBottom: '40px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
        <Card title="Баланс счетов" icon="💳" color="#007bff" value={show((s) => s.totalBalance)} note="По подключённым счетам" testId="stat-balance" />
        <Card title="Доходы" icon="💰" color="#28a745" value={show((s) => s.monthlyIncome)} note={`За ${month}`} testId="stat-income" />
        <Card title="Расходы" icon="💸" color="#dc3545" value={show((s) => s.monthlyExpenses)} note={`За ${month}`} testId="stat-expenses" />
        <Card
          title="Накопления"
          icon="🐷"
          color="#6f42c1"
          value={show((s) => s.totalSavings)}
          note={stats && stats.savingsGoalsCount > 0 ? `Цель: ${formatRub(stats.savingsTarget)}` : 'Целей пока нет'}
          testId="stat-savings"
        />
      </div>
      {error && <p style={{ color: '#b02a37', fontSize: '14px' }}>Не удалось загрузить сводку</p>}
    </div>
  );
}
