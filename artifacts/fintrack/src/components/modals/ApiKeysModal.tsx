interface ApiKeysModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ApiKeysModal({ isOpen, onClose }: ApiKeysModalProps) {
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
          <h2 style={{ margin: 0, color: '#333' }}>🔑 Управление ключами API</h2>
          <button 
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer' }}
          >
            ×
          </button>
        </div>
        
        <div style={{ marginBottom: '25px' }}>
          <h3 style={{ margin: '0 0 15px 0', color: '#333' }}>🏦 Банковские API</h3>
          {[
            { name: 'Сбербанк API', status: 'active', key: '••••••••••••7834', expires: '15.08.2025' },
            { name: 'ВТБ API', status: 'active', key: '••••••••••••9102', expires: '22.11.2025' },
            { name: 'Тинькофф API', status: 'testing', key: '••••••••••••4567', expires: '30.06.2025' },
            { name: 'Альфа-Банк API', status: 'inactive', key: 'Не настроен', expires: '-' }
          ].map((api, idx) => (
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
                <strong>{api.name}</strong><br/>
                <span style={{ fontSize: '12px', color: '#666' }}>Ключ: {api.key} | Истекает: {api.expires}</span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <span style={{
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '12px',
                  backgroundColor: api.status === 'active' ? '#28a745' : api.status === 'testing' ? '#ffc107' : '#6c757d',
                  color: 'white'
                }}>
                  {api.status === 'active' ? '✅ Активен' : api.status === 'testing' ? '⚠️ Тест' : '❌ Неактивен'}
                </span>
                <button style={{
                  padding: '4px 8px',
                  backgroundColor: '#007bff',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px'
                }}>
                  Настроить
                </button>
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginBottom: '25px' }}>
          <h3 style={{ margin: '0 0 15px 0', color: '#333' }}>💳 Платёжные системы</h3>
          {[
            { name: 'YuKassa', status: 'active', key: '••••••••••••2156', shop: 'Shop ID: 123456' },
            { name: 'CloudPayments', status: 'active', key: '••••••••••••8943', shop: 'Public ID: CP789' },
            { name: 'Сбербанк Эквайринг', status: 'setup', key: 'В настройке', shop: 'Terminal ID: -' }
          ].map((pay, idx) => (
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
                <strong>{pay.name}</strong><br/>
                <span style={{ fontSize: '12px', color: '#666' }}>{pay.shop} | Ключ: {pay.key}</span>
              </div>
              <button style={{
                padding: '6px 12px',
                backgroundColor: '#17a2b8',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px'
              }}>
                Управлять
              </button>
            </div>
          ))}
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button style={{
            padding: '8px 16px',
            backgroundColor: '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer'
          }}>
            + Добавить API
          </button>
          <button 
            onClick={onClose}
            style={{
            padding: '8px 16px',
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