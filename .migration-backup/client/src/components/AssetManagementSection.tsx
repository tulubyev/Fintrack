import { useState, useEffect } from 'react';

// Компонент для управления активами и инвестициями
export function AssetManagementSection({ user }: any) {
  const [portfolio, setPortfolio] = useState<any>(null);
  const [assets, setAssets] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeView, setActiveView] = useState('overview');

  useEffect(() => {
    loadPortfolio();
    loadAssets();
    loadInvestmentTransactions();
  }, []);

  const loadPortfolio = async () => {
    // Mock portfolio data - in production this would come from investment APIs
    setPortfolio({
      totalValue: 892500,
      totalGain: 52200,
      gainPercent: 6.21,
      monthlyGain: 15800,
      monthlyGainPercent: 1.8
    });
  };

  const loadAssets = async () => {
    // Mock assets data - in production this would come from investment APIs
    setAssets([
      {
        id: '1',
        symbol: 'SBER',
        name: 'Сбербанк',
        type: 'stock',
        quantity: 100,
        price: 280.50,
        value: 28050,
        gain: 2250,
        gainPercent: 8.7
      },
      {
        id: '2',
        symbol: 'GAZP',
        name: 'Газпром',
        type: 'stock',
        quantity: 200,
        price: 178.30,
        value: 35660,
        gain: -1540,
        gainPercent: -4.1
      },
      {
        id: '3',
        symbol: 'LKOH',
        name: 'ЛУКОЙЛ',
        type: 'stock',
        quantity: 50,
        price: 6254.00,
        value: 312700,
        gain: 15650,
        gainPercent: 5.3
      }
    ]);
  };

  const loadInvestmentTransactions = async () => {
    // Mock transactions
    setTransactions([
      {
        id: '1',
        type: 'buy',
        symbol: 'SBER',
        quantity: 50,
        price: 275.20,
        total: 13760,
        date: '2024-12-20'
      },
      {
        id: '2',
        type: 'sell',
        symbol: 'GAZP',
        quantity: 100,
        price: 185.40,
        total: 18540,
        date: '2024-12-18'
      },
      {
        id: '3',
        type: 'dividend',
        symbol: 'LKOH',
        quantity: 50,
        price: 125.00,
        total: 6250,
        date: '2024-12-15'
      }
    ]);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB'
    }).format(amount);
  };

  const getAssetTypeIcon = (type: string) => {
    switch (type) {
      case 'stock': return '📈';
      case 'bond': return '📊';
      case 'fund': return '💼';
      case 'crypto': return '₿';
      default: return '💰';
    }
  };

  const getTransactionTypeIcon = (type: string) => {
    switch (type) {
      case 'buy': return '🟢';
      case 'sell': return '🔴';
      case 'dividend': return '💰';
      default: return '📝';
    }
  };

  if (!portfolio) {
    return (
      <div style={{ 
        backgroundColor: 'white', 
        padding: '20px', 
        borderRadius: '8px', 
        boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)',
        marginBottom: '20px',
        textAlign: 'center'
      }}>
        <div style={{ fontSize: '48px', marginBottom: '10px' }}>⏳</div>
        <p>Загрузка портфеля...</p>
      </div>
    );
  }

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
        marginBottom: '20px',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <h2 style={{ 
            margin: '0', 
            color: '#333', 
            fontSize: '22px',
            fontWeight: '600'
          }}>
            📊 Инвестиционный портфель
          </h2>
          <div style={{
            marginLeft: '10px',
            padding: '2px 8px',
            backgroundColor: '#e3f2fd',
            borderRadius: '12px',
            fontSize: '12px',
            color: '#1976d2'
          }}>
            {assets.length} активов
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => setActiveView('overview')}
            style={{
              padding: '6px 12px',
              backgroundColor: activeView === 'overview' ? '#1976d2' : '#f5f5f5',
              color: activeView === 'overview' ? 'white' : '#333',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px'
            }}
          >
            Обзор
          </button>
          <button
            onClick={() => setActiveView('assets')}
            style={{
              padding: '6px 12px',
              backgroundColor: activeView === 'assets' ? '#1976d2' : '#f5f5f5',
              color: activeView === 'assets' ? 'white' : '#333',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px'
            }}
          >
            Активы
          </button>
          <button
            onClick={() => setActiveView('transactions')}
            style={{
              padding: '6px 12px',
              backgroundColor: activeView === 'transactions' ? '#1976d2' : '#f5f5f5',
              color: activeView === 'transactions' ? 'white' : '#333',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px'
            }}
          >
            Операции
          </button>
        </div>
      </div>

      {/* Portfolio Overview */}
      {activeView === 'overview' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '20px' }}>
            <div style={{
              padding: '15px',
              backgroundColor: '#f8f9fa',
              borderRadius: '8px',
              border: '1px solid #e9ecef'
            }}>
              <h4 style={{ margin: '0 0 8px 0', color: '#666', fontSize: '14px' }}>Общая стоимость</h4>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#333' }}>
                {formatCurrency(portfolio.totalValue)}
              </div>
            </div>

            <div style={{
              padding: '15px',
              backgroundColor: '#f8f9fa',
              borderRadius: '8px',
              border: '1px solid #e9ecef'
            }}>
              <h4 style={{ margin: '0 0 8px 0', color: '#666', fontSize: '14px' }}>Общая прибыль</h4>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: portfolio.totalGain >= 0 ? '#28a745' : '#dc3545' }}>
                {formatCurrency(portfolio.totalGain)}
              </div>
              <div style={{ fontSize: '12px', color: portfolio.totalGain >= 0 ? '#28a745' : '#dc3545' }}>
                {portfolio.totalGain >= 0 ? '+' : ''}{portfolio.gainPercent}%
              </div>
            </div>

            <div style={{
              padding: '15px',
              backgroundColor: '#f8f9fa',
              borderRadius: '8px',
              border: '1px solid #e9ecef'
            }}>
              <h4 style={{ margin: '0 0 8px 0', color: '#666', fontSize: '14px' }}>За месяц</h4>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: portfolio.monthlyGain >= 0 ? '#28a745' : '#dc3545' }}>
                {formatCurrency(portfolio.monthlyGain)}
              </div>
              <div style={{ fontSize: '12px', color: portfolio.monthlyGain >= 0 ? '#28a745' : '#dc3545' }}>
                {portfolio.monthlyGain >= 0 ? '+' : ''}{portfolio.monthlyGainPercent}%
              </div>
            </div>
          </div>

          {/* Top Assets */}
          <h3 style={{ margin: '0 0 15px 0', color: '#333', fontSize: '18px' }}>Топ активы</h3>
          <div style={{ display: 'grid', gap: '10px' }}>
            {assets.slice(0, 3).map((asset) => (
              <div
                key={asset.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px',
                  border: '1px solid #e9ecef',
                  borderRadius: '8px',
                  backgroundColor: '#fdfdfd'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '20px' }}>{getAssetTypeIcon(asset.type)}</span>
                  <div>
                    <div style={{ fontWeight: '500', color: '#333' }}>{asset.name}</div>
                    <div style={{ fontSize: '12px', color: '#666' }}>
                      {asset.quantity} шт. × {formatCurrency(asset.price)}
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 'bold', color: '#333' }}>
                    {formatCurrency(asset.value)}
                  </div>
                  <div style={{ 
                    fontSize: '12px', 
                    color: asset.gain >= 0 ? '#28a745' : '#dc3545' 
                  }}>
                    {asset.gain >= 0 ? '+' : ''}{formatCurrency(asset.gain)} ({asset.gainPercent}%)
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Assets View */}
      {activeView === 'assets' && (
        <div>
          <h3 style={{ margin: '0 0 15px 0', color: '#333', fontSize: '18px' }}>Все активы</h3>
          <div style={{ display: 'grid', gap: '10px' }}>
            {assets.map((asset) => (
              <div
                key={asset.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '15px',
                  border: '1px solid #e9ecef',
                  borderRadius: '8px',
                  backgroundColor: '#fdfdfd'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flex: 1 }}>
                  <span style={{ fontSize: '24px' }}>{getAssetTypeIcon(asset.type)}</span>
                  <div>
                    <div style={{ fontWeight: '600', color: '#333', fontSize: '16px' }}>
                      {asset.name} ({asset.symbol})
                    </div>
                    <div style={{ fontSize: '14px', color: '#666', marginTop: '2px' }}>
                      {asset.quantity} шт. × {formatCurrency(asset.price)}
                    </div>
                  </div>
                </div>
                
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 'bold', color: '#333', fontSize: '18px' }}>
                    {formatCurrency(asset.value)}
                  </div>
                  <div style={{ 
                    fontSize: '14px', 
                    color: asset.gain >= 0 ? '#28a745' : '#dc3545',
                    fontWeight: '500'
                  }}>
                    {asset.gain >= 0 ? '+' : ''}{formatCurrency(asset.gain)} ({asset.gainPercent >= 0 ? '+' : ''}{asset.gainPercent}%)
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Transactions View */}
      {activeView === 'transactions' && (
        <div>
          <h3 style={{ margin: '0 0 15px 0', color: '#333', fontSize: '18px' }}>История операций</h3>
          <div style={{ display: 'grid', gap: '10px' }}>
            {transactions.map((transaction) => (
              <div
                key={transaction.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px',
                  border: '1px solid #e9ecef',
                  borderRadius: '8px',
                  backgroundColor: '#fdfdfd'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '18px' }}>{getTransactionTypeIcon(transaction.type)}</span>
                  <div>
                    <div style={{ fontWeight: '500', color: '#333' }}>
                      {transaction.type === 'buy' ? 'Покупка' : 
                       transaction.type === 'sell' ? 'Продажа' : 'Дивиденд'} {transaction.symbol}
                    </div>
                    <div style={{ fontSize: '12px', color: '#666' }}>
                      {new Date(transaction.date).toLocaleDateString('ru-RU')} • 
                      {transaction.type !== 'dividend' && ` ${transaction.quantity} шт. × ${formatCurrency(transaction.price)}`}
                    </div>
                  </div>
                </div>
                <div style={{ 
                  fontWeight: 'bold', 
                  color: transaction.type === 'sell' || transaction.type === 'dividend' ? '#28a745' : '#dc3545',
                  fontSize: '16px'
                }}>
                  {transaction.type === 'buy' ? '-' : '+'}{formatCurrency(transaction.total)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}