interface WebhooksModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function WebhooksModal({ isOpen, onClose }: WebhooksModalProps) {
  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      backgroundColor: 'rgba(0,0,0,0.5)',
      zIndex: 1000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      <div style={{
        backgroundColor: 'white',
        padding: '30px',
        borderRadius: '12px',
        width: '90%',
        maxWidth: '800px',
        maxHeight: '80vh',
        overflowY: 'auto'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0, color: '#333' }}>📡 Настройка вебхуков</h2>
          <button 
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer' }}
          >
            ×
          </button>
        </div>
        
        <div style={{ marginBottom: '20px' }}>
          <h3 style={{ margin: '0 0 15px 0', color: '#333' }}>🔗 Активные вебхуки</h3>
          {[
            { service: 'YuKassa', event: 'payment.succeeded', url: 'https://api.fintrack.ru/webhooks/yukassa', status: 'active' },
            { service: 'CloudPayments', event: 'transaction.completed', url: 'https://api.fintrack.ru/webhooks/cloudpayments', status: 'active' },
            { service: 'Сбербанк', event: 'account.updated', url: 'https://api.fintrack.ru/webhooks/sberbank', status: 'inactive' },
            { service: 'Тинькофф', event: 'investment.order', url: 'https://api.fintrack.ru/webhooks/tinkoff', status: 'testing' }
          ].map((webhook, idx) => (
            <div key={idx} style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px',
              backgroundColor: '#f8f9fa',
              borderRadius: '6px',
              marginBottom: '8px'
            }}>
              <div>
                <strong>{webhook.service}</strong><br/>
                <span style={{ fontSize: '12px', color: '#666' }}>
                  Событие: {webhook.event}<br/>
                  URL: {webhook.url}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span style={{
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '12px',
                  backgroundColor: webhook.status === 'active' ? '#28a745' : webhook.status === 'testing' ? '#ffc107' : '#6c757d',
                  color: 'white'
                }}>
                  {webhook.status === 'active' ? '✅' : webhook.status === 'testing' ? '⚠️' : '❌'}
                </span>
                <button style={{
                  padding: '4px 8px',
                  backgroundColor: '#17a2b8',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px'
                }}>
                  Тест
                </button>
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginBottom: '20px' }}>
          <h3 style={{ margin: '0 0 15px 0', color: '#333' }}>➕ Добавить новый вебхук</h3>
          <div style={{ display: 'grid', gap: '10px' }}>
            <input type="text" placeholder="Название сервиса" style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }} />
            <input type="text" placeholder="URL вебхука" style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }} />
            <select style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}>
              <option>Выберите событие</option>
              <option>payment.succeeded</option>
              <option>payment.failed</option>
              <option>account.updated</option>
              <option>transaction.completed</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
          <button style={{
            padding: '10px 20px',
            backgroundColor: '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer'
          }}>
            ➕ Добавить вебхук
          </button>
          <button 
            onClick={onClose}
            style={{
            padding: '10px 20px',
            backgroundColor: '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer'
          }}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}