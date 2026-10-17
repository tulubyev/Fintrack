import { useState, useEffect } from 'react';
import { VerificationCard } from './components/VerificationCard';
import { VerificationModal } from './components/VerificationModal';
import { ProfileImageUploader } from './components/ProfileImageUploader';
import { ApiKeysModal } from './components/modals/ApiKeysModal';
import { SyncModal } from './components/modals/SyncModal';
import { WebhooksModal } from './components/modals/WebhooksModal';
import { SecurityModal } from './components/modals/SecurityModal';
import { DocumentsSection } from './components/DocumentsSection';
import { BankConnectionsSection } from './components/BankConnectionsSection';
import { AssetManagementSection } from './components/AssetManagementSection';
import AdminPanel from './components/AdminPanel';
import { ProfileSection } from './components/ProfileSection';
import { AuthForm } from './components/AuthForm';
import AIAssistant from './components/dashboard/AIAssistant';

import { phoneMask, formatPhoneToInternational, validateRussianPhone } from './utils/phoneUtils';
import { handleDocumentView, handleDocumentDownload, handleDocumentDelete, handleSubmitForReview } from './services/documentService';


function App() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  // Убираем activeSection, теперь всё будет в едином дашборде

  // Функция для получения cookie по имени
  const getCookie = (name: string): string | null => {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
    return null;
  };

  // Функция для удаления cookie
  const deleteCookie = (name: string) => {
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
  };

  useEffect(() => {
    // SECURITY FIX: Проверяем ESIA callback через cookie (не через URL)
    const esiaToken = getCookie('esia_auth_token');
    const esiaSuccess = getCookie('esia_auth_success');
    
    if (esiaToken && esiaSuccess === 'true') {
      // Сохраняем токен в localStorage и удаляем cookies
      localStorage.setItem('accessToken', esiaToken);
      deleteCookie('esia_auth_token');
      deleteCookie('esia_auth_success');
      
      // Очищаем URL от параметров callback
      if (window.location.search.includes('esia_callback')) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }

    // Сначала проверяем сохраненные данные пользователя
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser);
        setCurrentUser(parsedUser);
      } catch (error) {
        console.warn('Ошибка загрузки сохраненного пользователя:', error);
      }
    }

    // Проверяем токен при загрузке
    const token = localStorage.getItem('accessToken');
    if (token) {
      // Проверяем токен на сервере
      fetch('/api/auth/verify', {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then(response => {
        if (response.ok) {
          return response.json();
        }
        throw new Error('Token invalid');
      })
      .then(data => {
        // Обновляем пользователя данными с сервера
        const serverUser = {
          ...data.user,
          role: 'admin',
          adminRole: 'super_admin',
          // Исправляем названия полей верификации
          verificationLevel2: data.user.verification_level_2 || data.user.verificationLevel2,
          verificationLevel3: data.user.verification_level_3 || data.user.verificationLevel3
        };
        setCurrentUser(serverUser);
        // Сохраняем обновленные данные
        localStorage.setItem('currentUser', JSON.stringify(serverUser));
      })
      .catch(() => {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('currentUser');
        setCurrentUser(null);
      })
      .finally(() => {
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, []);

  const handleAuthSuccess = (user: any) => {
    // Исправляем названия полей верификации при получении пользователя
    const correctedUser = {
      ...user,
      verificationLevel2: user.verification_level_2 || user.verificationLevel2,
      verificationLevel3: user.verification_level_3 || user.verificationLevel3
    };
    setCurrentUser(correctedUser);
  };

  const handleLogout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('currentUser');
    setCurrentUser(null);
    setShowAdminPanel(false);
  };

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', backgroundColor: '#f8f9fa', minHeight: '100vh' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh', flexDirection: 'column' }}>
          <div style={{ width: '40px', height: '40px', border: '4px solid #f3f3f3', borderTop: '4px solid #007bff', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
          <h1 style={{ marginTop: '20px', color: '#333' }}>Загрузка FinTrack...</h1>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <AuthForm onAuthSuccess={handleAuthSuccess} />;
  }

  // Проверяем, есть ли у пользователя админ-роль и нужно ли показать админ-панель
  if (currentUser.adminRole && showAdminPanel) {
    return (
      <AdminPanel 
        user={currentUser} 
        onBack={() => setShowAdminPanel(false)} 
      />
    );
  }

  return (
    <div style={{ backgroundColor: '#f8f9fa', minHeight: '100vh' }}>
      {/* Заголовок приложения */}
      <div style={{ backgroundColor: 'white', padding: '20px 30px', borderBottom: '1px solid #dee2e6' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '32px' }}>₽</span>
            <div>
              <h1 style={{ margin: '0', color: '#333', fontSize: '24px' }}>FinTrack</h1>
              <p style={{ margin: '0', color: '#666', fontSize: '14px' }}>
                Привет, {currentUser.firstName}! Добро пожаловать в ваш финансовый агрегатор
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            {/* Показываем кнопку админ-панели для администраторов */}
            {currentUser.adminRole && (
              <button
                onClick={() => setShowAdminPanel(true)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#007bff',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
                data-testid="nav-admin-panel"
              >
                <span>⚙️</span>
                Админ-панель
              </button>
            )}
            <button
              onClick={handleLogout}
              style={{
                padding: '8px 16px',
                backgroundColor: '#dc3545',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
              data-testid="nav-logout"
            >
              <span>🚪</span>
              Выход
            </button>
          </div>
        </div>
      </div>

      {/* Единый дашборд с всеми секциями */}
      <div style={{ padding: '30px' }}>
        <UnifiedDashboard user={currentUser} onUserUpdate={(updatedUser: any) => {
          const newUser = { ...currentUser, ...updatedUser };
          console.log('Обновляем состояние пользователя:', newUser);
          setCurrentUser(newUser);
          // Сохраняем обновленные данные пользователя в localStorage для персистентности
          localStorage.setItem('currentUser', JSON.stringify(newUser));
        }} />
      </div>
    </div>
  );
}

// Единый дашборд со всеми секциями
function UnifiedDashboard({ user, onUserUpdate }: any) {
  const [activeSection, setActiveSection] = useState<string | null>(null);

  // Данные для блоков направлений
  const sections = [
    {
      id: 'banks',
      title: 'БАНКИ',
      icon: '🏦',
      description: 'Банковские подключения',
      color: '#007bff',
      component: <BankConnectionsSection user={user} />
    },
    {
      id: 'investments',
      title: 'ИНВЕСТИЦИИ',
      icon: '📈',
      description: 'Управление активами',
      color: '#28a745',
      component: <AssetManagementSection user={user} />
    },
    {
      id: 'profile',
      title: 'ЛИЧНЫЙ ПРОФИЛЬ',
      icon: '👤',
      description: 'Верификация и настройки',
      color: '#6f42c1',
      component: <ProfileSection user={user} onUserUpdate={onUserUpdate} />
    },
    {
      id: 'transactions',
      title: 'ОПЕРАЦИИ',
      icon: '📊',
      description: 'История транзакций',
      color: '#fd7e14',
      component: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          {[
            { id: 1, type: 'income', description: 'Зарплата', amount: 85000, date: '2024-12-28', category: 'Доход' },
            { id: 2, type: 'expense', description: 'Продукты Пятёрочка', amount: -2450, date: '2024-12-27', category: 'Еда' },
            { id: 3, type: 'expense', description: 'Заправка BP', amount: -3200, date: '2024-12-27', category: 'Транспорт' },
            { id: 4, type: 'investment', description: 'Покупка акций SBER', amount: -15000, date: '2024-12-26', category: 'Инвестиции' },
            { id: 5, type: 'expense', description: 'Интернет Ростелеком', amount: -890, date: '2024-12-25', category: 'Коммунальные' }
          ].map(transaction => (
            <div 
              key={transaction.id}
              style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                padding: '15px',
                backgroundColor: '#f8f9fa',
                borderRadius: '8px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <div style={{ 
                  width: '40px', 
                  height: '40px', 
                  borderRadius: '50%', 
                  backgroundColor: transaction.type === 'income' ? '#d4edda' : transaction.type === 'investment' ? '#fff3cd' : '#f8d7da',
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  fontSize: '16px'
                }}>
                  {transaction.type === 'income' ? '💰' : transaction.type === 'investment' ? '📈' : '💸'}
                </div>
                <div>
                  <div style={{ fontWeight: '500', marginBottom: '4px' }}>{transaction.description}</div>
                  <div style={{ fontSize: '14px', color: '#666' }}>{transaction.category} • {transaction.date}</div>
                </div>
              </div>
              <div style={{ 
                fontWeight: 'bold', 
                fontSize: '16px',
                color: transaction.amount > 0 ? '#28a745' : '#dc3545'
              }}>
                {transaction.amount > 0 ? '+' : ''}{new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' }).format(transaction.amount)}
              </div>
            </div>
          ))}
        </div>
      )
    },
    {
      id: 'assistant',
      title: 'ПОМОЩНИК',
      icon: '🤖',
      description: 'AI финансовый помощник',
      color: '#20c997',
      component: <AIAssistant />
    }
  ];

  return (
    <div>
      {/* Основные финансовые карточки */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', 
        gap: '20px',
        marginBottom: '40px'
      }}>
        <div style={{ backgroundColor: 'white', padding: '25px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '15px' }}>
            <h3 style={{ margin: '0', color: '#495057', fontSize: '16px' }}>Общий баланс</h3>
            <span style={{ fontSize: '24px' }}>💳</span>
          </div>
          <div style={{ fontSize: '36px', fontWeight: 'bold', color: '#007bff', marginBottom: '5px' }}>
            ₽127,450
          </div>
          <p style={{ margin: '0', color: '#6c757d', fontSize: '14px' }}>
            +12% с прошлого месяца
          </p>
        </div>

        <div style={{ backgroundColor: 'white', padding: '25px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '15px' }}>
            <h3 style={{ margin: '0', color: '#495057', fontSize: '16px' }}>Сбережения</h3>
            <span style={{ fontSize: '24px' }}>🐷</span>
          </div>
          <div style={{ fontSize: '36px', fontWeight: 'bold', color: '#28a745', marginBottom: '5px' }}>
            ₽45,230
          </div>
          <p style={{ margin: '0', color: '#6c757d', fontSize: '14px' }}>
            Цель: ₽100,000 (45%)
          </p>
        </div>

        <div style={{ backgroundColor: 'white', padding: '25px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '15px' }}>
            <h3 style={{ margin: '0', color: '#495057', fontSize: '16px' }}>Инвестиции</h3>
            <span style={{ fontSize: '24px' }}>📈</span>
          </div>
          <div style={{ fontSize: '36px', fontWeight: 'bold', color: '#ffc107', marginBottom: '5px' }}>
            ₽82,220
          </div>
          <p style={{ margin: '0', color: '#6c757d', fontSize: '14px' }}>
            +5.2% доходность
          </p>
        </div>
      </div>

      {/* Блоки направлений */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
        gap: '20px',
        marginBottom: '40px'
      }}>
        {sections.map(section => (
          <button
            key={section.id}
            onClick={() => setActiveSection(activeSection === section.id ? null : section.id)}
            style={{
              backgroundColor: activeSection === section.id ? section.color : 'white',
              color: activeSection === section.id ? 'white' : '#333',
              border: `2px solid ${section.color}`,
              borderRadius: '12px',
              padding: '25px',
              cursor: 'pointer',
              textAlign: 'left',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              transition: 'all 0.3s ease',
              transform: activeSection === section.id ? 'scale(1.02)' : 'scale(1)'
            }}
            data-testid={`button-section-${section.id}`}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '15px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <span style={{ fontSize: '32px' }}>{section.icon}</span>
                <div>
                  <h3 style={{ margin: '0', fontSize: '18px', fontWeight: 'bold' }}>
                    {section.title}
                  </h3>
                  <p style={{ margin: '0', fontSize: '14px', opacity: 0.8 }}>
                    {section.description}
                  </p>
                </div>
              </div>
              <span style={{ fontSize: '20px', transform: activeSection === section.id ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.3s ease' }}>
                ▼
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* Активная секция */}
      {activeSection && (
        <div style={{ 
          backgroundColor: 'white', 
          padding: '30px', 
          borderRadius: '12px', 
          boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
          marginBottom: '40px',
          border: `3px solid ${sections.find(s => s.id === activeSection)?.color}`,
          animation: 'fadeIn 0.3s ease'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '25px' }}>
            <h2 style={{ 
              margin: '0', 
              color: sections.find(s => s.id === activeSection)?.color, 
              fontSize: '24px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <span>{sections.find(s => s.id === activeSection)?.icon}</span>
              {sections.find(s => s.id === activeSection)?.title}
            </h2>
            <button
              onClick={() => setActiveSection(null)}
              style={{
                backgroundColor: 'transparent',
                border: 'none',
                fontSize: '24px',
                cursor: 'pointer',
                color: '#666',
                padding: '5px'
              }}
              data-testid="button-close-section"
            >
              ✕
            </button>
          </div>
          {sections.find(s => s.id === activeSection)?.component}
        </div>
      )}
    </div>
  );
}

export default App;

