interface ApiManagementProps {
  isVisible: boolean;
  onShowApiKeys: () => void;
  onShowSync: () => void;
  onShowWebhooks: () => void;
  onShowSecurity: () => void;
}

export function ApiManagement({ 
  isVisible, 
  onShowApiKeys, 
  onShowSync, 
  onShowWebhooks, 
  onShowSecurity 
}: ApiManagementProps) {
  if (!isVisible) return null;

  return (
    <div style={{ backgroundColor: 'white', padding: '25px', borderRadius: '12px', border: '1px solid #e9ecef', marginBottom: '20px' }}>
      <h2 style={{ margin: '0 0 20px 0', color: '#333' }}>🔗 Управление API</h2>
      
      {/* Статус API */}
      <div style={{ marginBottom: '25px' }}>
        <h3 style={{ margin: '0 0 15px 0', color: '#333' }}>📊 Статус подключений</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '15px' }}>
          
          {/* Банки */}
          <div style={{ padding: '15px', backgroundColor: '#e3f2fd', borderRadius: '8px', border: '1px solid #bbdefb' }}>
            <h4 style={{ margin: '0 0 10px 0', color: '#1976d2', display: 'flex', alignItems: 'center', gap: '8px' }}>
              🏦 Банки
            </h4>
            <div style={{ fontSize: '13px', lineHeight: '1.4' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                <span>Сбербанк API:</span>
                <span style={{ color: '#28a745', fontWeight: 'bold' }}>✅ Активен</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                <span>ВТБ API:</span>
                <span style={{ color: '#28a745', fontWeight: 'bold' }}>✅ Активен</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                <span>Тинькофф API:</span>
                <span style={{ color: '#ffc107', fontWeight: 'bold' }}>⚠️ Тест</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                <span>Альфа-Банк API:</span>
                <span style={{ color: '#dc3545', fontWeight: 'bold' }}>❌ Отключен</span>
              </div>
            </div>
          </div>

          {/* Платёжные системы */}
          <div style={{ padding: '15px', backgroundColor: '#f3e5f5', borderRadius: '8px', border: '1px solid #e1bee7' }}>
            <h4 style={{ margin: '0 0 10px 0', color: '#7b1fa2', display: 'flex', alignItems: 'center', gap: '8px' }}>
              💳 Платёжные системы
            </h4>
            <div style={{ fontSize: '13px', lineHeight: '1.4' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                <span>YuKassa:</span>
                <span style={{ color: '#28a745', fontWeight: 'bold' }}>✅ Активна</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                <span>CloudPayments:</span>
                <span style={{ color: '#28a745', fontWeight: 'bold' }}>✅ Активна</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                <span>Сбербанк Эквайринг:</span>
                <span style={{ color: '#ffc107', fontWeight: 'bold' }}>⚠️ Настройка</span>
              </div>
            </div>
          </div>

          {/* Внешние сервисы */}
          <div style={{ padding: '15px', backgroundColor: '#fff8e1', borderRadius: '8px', border: '1px solid #ffecb3' }}>
            <h4 style={{ margin: '0 0 10px 0', color: '#f57c00', display: 'flex', alignItems: 'center', gap: '8px' }}>
              🌐 Внешние сервисы
            </h4>
            <div style={{ fontSize: '13px', lineHeight: '1.4' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                <span>OpenRouter API:</span>
                <span style={{ color: '#28a745', fontWeight: 'bold' }}>✅ Активен</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                <span>SMS.ru:</span>
                <span style={{ color: '#28a745', fontWeight: 'bold' }}>✅ Активен</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                <span>Email (SMTP):</span>
                <span style={{ color: '#28a745', fontWeight: 'bold' }}>✅ Активен</span>
              </div>
            </div>
          </div>

          {/* Статистика запросов */}
          <div style={{ padding: '15px', backgroundColor: '#e8f5e8', borderRadius: '8px', border: '1px solid #c8e6c9' }}>
            <h4 style={{ margin: '0 0 10px 0', color: '#2e7d32', display: 'flex', alignItems: 'center', gap: '8px' }}>
              📈 Статистика за сегодня
            </h4>
            <div style={{ fontSize: '13px', lineHeight: '1.4' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                <span>Всего запросов:</span>
                <span style={{ fontWeight: 'bold' }}>2,847</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                <span>Успешных:</span>
                <span style={{ color: '#28a745', fontWeight: 'bold' }}>2,801 (98.4%)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                <span>Ошибок:</span>
                <span style={{ color: '#dc3545', fontWeight: 'bold' }}>46 (1.6%)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                <span>Среднее время ответа:</span>
                <span style={{ fontWeight: 'bold' }}>234ms</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Управляющие кнопки */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
        <button 
          onClick={onShowApiKeys}
          style={{
            padding: '15px 20px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px'
          }}
        >
          🔑 Управление ключами
        </button>
        
        <button 
          onClick={onShowSync}
          style={{
            padding: '15px 20px',
            backgroundColor: '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px'
          }}
        >
          🔄 Синхронизация
        </button>

        <button 
          onClick={onShowWebhooks}
          style={{
            padding: '15px 20px',
            backgroundColor: '#17a2b8',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px'
          }}
        >
          📡 Настройка вебхуков
        </button>

        <button 
          onClick={onShowSecurity}
          style={{
            padding: '15px 20px',
            backgroundColor: '#dc3545',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px'
          }}
        >
          🛡️ Безопасность API
        </button>
      </div>
    </div>
  );
}