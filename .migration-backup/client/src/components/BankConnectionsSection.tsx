import { useState, useEffect } from 'react';

// Компонент для подключения банков и управления счетами
export function BankConnectionsSection({ user }: any) {
  const [bankConnections, setBankConnections] = useState([]);
  const [availableBanks, setAvailableBanks] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedBank, setSelectedBank] = useState('');

  useEffect(() => {
    loadBankConnections();
    loadAvailableBanks();
    loadAccounts();
  }, []);

  const loadBankConnections = async () => {
    try {
      const response = await fetch('/api/banks/connections', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` }
      });
      if (response.ok) {
        const connections = await response.json();
        setBankConnections(connections);
      }
    } catch (error: any) {
      console.error('Error loading bank connections:', error);
    }
  };

  const loadAvailableBanks = async () => {
    try {
      const response = await fetch('/api/banks/available', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` }
      });
      if (response.ok) {
        const banks = await response.json();
        setAvailableBanks(banks);
      }
    } catch (error: any) {
      console.error('Error loading available banks:', error);
    }
  };

  const loadAccounts = async () => {
    try {
      const response = await fetch('/api/accounts', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` }
      });
      if (response.ok) {
        const userAccounts = await response.json();
        setAccounts(userAccounts);
      }
    } catch (error: any) {
      console.error('Error loading accounts:', error);
    }
  };

  const handleConnectBank = async () => {
    if (!selectedBank) {
      alert('Выберите банк для подключения');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/banks/real/connect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
        },
        body: JSON.stringify({ bankCode: selectedBank })
      });

      if (response.ok) {
        const result = await response.json();
        if (result.redirectUrl) {
          // Redirect to bank's OAuth page
          window.open(result.redirectUrl, '_blank');
        }
        alert('Переходите по ссылке для авторизации в банке');
        setSelectedBank('');
      } else {
        throw new Error('Failed to initiate bank connection');
      }
    } catch (error: any) {
      console.error('Connection error:', error);
      alert('Ошибка подключения к банку: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const syncBankData = async (connectionId: any) => {
    try {
      const response = await fetch(`/api/banks/real/sync/${connectionId}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` }
      });
      
      if (response.ok) {
        alert('Данные успешно синхронизированы');
        loadAccounts();
        loadBankConnections();
      } else {
        throw new Error('Sync failed');
      }
    } catch (error: any) {
      console.error('Sync error:', error);
      alert('Ошибка синхронизации: ' + error.message);
    }
  };

  const getBankLogo = (bankCode: any) => {
    const logos: any = {
      'sberbank': '🟢',
      'vtb': '🔵', 
      'gazprombank': '⚡',
      'alfabank': '🔴',
      'tinkoff': '🟡',
      'raiffeisen': '🟠',
      'openbank': '⚪',
      'rosbank': '🔶'
    };
    return logos[bankCode] || '🏦';
  };

  const getAccountTypeIcon = (accountType: any) => {
    switch (accountType) {
      case 'current': return '💳';
      case 'saving': return '💰';
      case 'deposit': return '📈';
      case 'credit': return '💸';
      default: return '🏦';
    }
  };

  const formatBalance = (balance: any) => {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB'
    }).format(balance);
  };

  return (
    <div style={{ 
      backgroundColor: 'white', 
      padding: '20px', 
      borderRadius: '8px', 
      boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)',
      marginBottom: '20px'
    }}>
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        marginBottom: '15px'
      }}>
        <h2 style={{ 
          margin: '0', 
          color: '#333', 
          fontSize: '22px',
          fontWeight: '600'
        }}>
          🏦 Банковские подключения
        </h2>
        <div style={{
          marginLeft: '10px',
          padding: '2px 8px',
          backgroundColor: '#e8f5e8',
          borderRadius: '12px',
          fontSize: '12px',
          color: '#2e7d2e'
        }}>
          {accounts.length} счетов
        </div>
      </div>

      {/* Форма подключения нового банка */}
      <div style={{ 
        border: '2px dashed #d4edd4', 
        padding: '20px', 
        borderRadius: '8px',
        backgroundColor: '#f8f9fa',
        marginBottom: '20px'
      }}>
        <h3 style={{ margin: '0 0 15px 0', color: '#495057' }}>➕ Подключить банк</h3>
        
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={selectedBank}
            onChange={(e) => setSelectedBank(e.target.value)}
            disabled={isLoading}
            style={{
              padding: '8px 12px',
              border: '1px solid #ced4da',
              borderRadius: '4px',
              backgroundColor: 'white',
              minWidth: '200px'
            }}
          >
            <option value="">Выберите банк</option>
            {availableBanks.map((bank: any) => (
              <option key={bank.code} value={bank.code}>
                {getBankLogo(bank.code)} {bank.name}
              </option>
            ))}
          </select>

          <button
            onClick={handleConnectBank}
            disabled={!selectedBank || isLoading}
            style={{
              padding: '8px 16px',
              backgroundColor: isLoading ? '#6c757d' : '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              opacity: !selectedBank ? 0.6 : 1
            }}
          >
            {isLoading ? '⏳ Подключение...' : '🔗 Подключить'}
          </button>
        </div>
      </div>

      {/* Список подключенных банков */}
      {bankConnections.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <h3 style={{ margin: '0 0 15px 0', color: '#333', fontSize: '18px' }}>
            Подключенные банки
          </h3>
          <div style={{ display: 'grid', gap: '10px' }}>
            {bankConnections.map((connection: any) => (
              <div
                key={connection.id}
                style={{
                  border: '1px solid #e9ecef',
                  borderRadius: '8px',
                  padding: '12px',
                  backgroundColor: '#f8f9fa',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '20px' }}>
                    {getBankLogo(connection.bankCode)}
                  </span>
                  <div>
                    <div style={{ fontWeight: '500', color: '#333' }}>
                      {connection.bankName}
                    </div>
                    <div style={{ fontSize: '12px', color: '#666' }}>
                      Подключен: {new Date(connection.connectedAt).toLocaleDateString('ru-RU')}
                    </div>
                  </div>
                </div>
                <div style={{
                  padding: '4px 8px',
                  borderRadius: '12px',
                  fontSize: '12px',
                  fontWeight: '500',
                  backgroundColor: connection.isActive ? '#d4edda' : '#f8d7da',
                  color: connection.isActive ? '#155724' : '#721c24'
                }}>
                  {connection.isActive ? '✅ Активен' : '❌ Неактивен'}
                </div>
                <button
                  onClick={() => syncBankData(connection.id)}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: '#007bff',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  🔄 Синхронизировать
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Список банковских счетов */}
      {accounts.length === 0 ? (
        <div style={{ 
          textAlign: 'center', 
          padding: '40px 20px',
          color: '#6c757d',
          backgroundColor: '#f8f9fa',
          borderRadius: '8px',
          border: '1px solid #e9ecef'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '10px' }}>🏦</div>
          <p style={{ margin: '0', fontSize: '16px' }}>Банковские счета не найдены</p>
          <p style={{ margin: '5px 0 0 0', fontSize: '14px' }}>Подключите банк для просмотра счетов</p>
        </div>
      ) : (
        <div>
          <h3 style={{ margin: '0 0 15px 0', color: '#333', fontSize: '18px' }}>
            Банковские счета
          </h3>
          <div style={{ display: 'grid', gap: '12px' }}>
            {accounts.map((account: any) => (
              <div
                key={account.id}
                style={{
                  border: '1px solid #e9ecef',
                  borderRadius: '8px',
                  padding: '15px',
                  backgroundColor: 'white',
                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: '5px' }}>
                      <span style={{ fontSize: '18px', marginRight: '8px' }}>
                        {getAccountTypeIcon(account.accountType)}
                      </span>
                      <h4 style={{ margin: '0', color: '#333', fontSize: '16px' }}>
                        {account.accountName || `Счет ${account.accountNumber.slice(-4)}`}
                      </h4>
                    </div>
                    <div style={{ fontSize: '14px', color: '#666', marginBottom: '5px' }}>
                      {account.bankName} • {account.accountNumber}
                    </div>
                    <div style={{ fontSize: '12px', color: '#999' }}>
                      Обновлен: {new Date(account.lastSyncAt || account.createdAt).toLocaleString('ru-RU')}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '18px', fontWeight: 'bold', color: account.balance >= 0 ? '#28a745' : '#dc3545' }}>
                      {formatBalance(account.balance)}
                    </div>
                    <div style={{ fontSize: '12px', color: '#666' }}>
                      {account.currency}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}