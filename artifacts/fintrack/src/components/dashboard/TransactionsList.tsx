import { useEffect, useState } from 'react';
import { formatRub } from './SummaryCards';

interface Transaction {
  id: string;
  amount: string;
  description: string;
  merchant: string | null;
  category: string | null;
  transactionDate: string;
}

// Последние операции пользователя
export function TransactionsList() {
  const [items, setItems] = useState<Transaction[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch('/api/transactions?limit=50', { headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` } })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setItems)
      .catch(() => setError(true));
  }, []);

  if (error) return <div style={{ color: '#b02a37' }}>Не удалось загрузить операции</div>;
  if (!items) return <div style={{ color: '#666' }}>Загрузка…</div>;
  if (items.length === 0) {
    return (
      <div style={{ padding: '30px', textAlign: 'center', color: '#666', background: '#f8f9fa', borderRadius: '8px' }} data-testid="transactions-empty">
        Операций пока нет.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }} data-testid="transactions-list">
      {items.map((t) => {
        const amount = parseFloat(t.amount);
        return (
          <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 500, marginBottom: '4px' }}>{t.merchant || t.description}</div>
              <div style={{ fontSize: '14px', color: '#666' }}>
                {[t.category, new Date(t.transactionDate).toLocaleDateString('ru-RU')].filter(Boolean).join(' • ')}
              </div>
            </div>
            <div style={{ fontWeight: 'bold', whiteSpace: 'nowrap', color: amount > 0 ? '#28a745' : '#dc3545' }}>
              {amount > 0 ? '+' : ''}{formatRub(amount)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
