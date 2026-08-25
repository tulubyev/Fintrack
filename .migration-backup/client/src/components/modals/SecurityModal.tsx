interface SecurityModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SecurityModal({ isOpen, onClose }: SecurityModalProps) {
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
          <h2 style={{ margin: 0, color: '#333' }}>🛡️ Безопасность API</h2>
          <button 
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer' }}
          >
            ×
          </button>
        </div>
        
        <div style={{ marginBottom: '20px' }}>
          <h3 style={{ margin: '0 0 15px 0', color: '#333' }}>🚨 Текущие угрозы</h3>
          <div style={{ display: 'grid', gap: '10px' }}>
            {[
              { type: 'warning', message: 'Превышен лимит запросов к Тинькофф API (85%)', time: '14:28' },
              { type: 'info', message: 'Новый IP адрес в логах Сбербанк API', time: '13:15' },
              { type: 'success', message: 'Все SSL сертификаты действительны', time: '12:00' }
            ].map((alert, idx) => (
              <div key={idx} style={{
                padding: '10px',
                backgroundColor: alert.type === 'warning' ? '#fff3cd' : alert.type === 'info' ? '#d1ecf1' : '#d4edda',
                border: `1px solid ${alert.type === 'warning' ? '#ffeaa7' : alert.type === 'info' ? '#bee5eb' : '#c3e6cb'}`,
                borderRadius: '4px'
              }}>
                <span style={{ 
                  marginRight: '8px',
                  color: alert.type === 'warning' ? '#856404' : alert.type === 'info' ? '#0c5460' : '#155724'
                }}>
                  {alert.type === 'warning' ? '⚠️' : alert.type === 'info' ? 'ℹ️' : '✅'}
                </span>
                <span>{alert.message}</span>
                <span style={{ float: 'right', fontSize: '12px', color: '#666' }}>{alert.time}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <h3 style={{ margin: '0 0 15px 0', color: '#333' }}>⚙️ Настройки безопасности</h3>
          <div style={{ display: 'grid', gap: '15px' }}>
            <div style={{ padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '6px' }}>
              <h4 style={{ margin: '0 0 10px 0' }}>🔐 Аутентификация</h4>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
                <input type="checkbox" defaultChecked />
                <span>Двухфакторная аутентификация для API</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input type="checkbox" defaultChecked />
                <span>Автоматическая ротация ключей (каждые 90 дней)</span>
              </label>
            </div>
            
            <div style={{ padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '6px' }}>
              <h4 style={{ margin: '0 0 10px 0' }}>🌐 Сетевая безопасность</h4>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
                <input type="checkbox" defaultChecked />
                <span>Whitelist IP адресов</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input type="checkbox" />
                <span>VPN обязательно для админ доступа</span>
              </label>
            </div>

            <div style={{ padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '6px' }}>
              <h4 style={{ margin: '0 0 10px 0' }}>📊 Мониторинг</h4>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
                <input type="checkbox" defaultChecked />
                <span>Уведомления о подозрительной активности</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input type="checkbox" defaultChecked />
                <span>Логирование всех API запросов</span>
              </label>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
          <button style={{
            padding: '10px 20px',
            backgroundColor: '#dc3545',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer'
          }}>
            🔒 Заблокировать все API
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