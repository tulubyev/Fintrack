import { useState, useEffect } from 'react';
import { AdminDashboardStats } from './admin/AdminDashboardStats';
import { PendingDocumentsList } from './admin/PendingDocumentsList';
import { UserManagement } from './admin/UserManagement';
import { DocumentArchive } from './admin/DocumentArchive';
import { SystemMonitoring } from './admin/SystemMonitoring';
import { AppSettings } from './admin/AppSettings';

// AdminPanel component for administrators
function AdminPanel({ user, onBack }: any) {
  const [pendingDocuments, setPendingDocuments] = useState([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState(true);
  const [showUserManagement, setShowUserManagement] = useState(false);
  const [showDocumentArchive, setShowDocumentArchive] = useState(false);
  const [showSystemMonitoring, setShowSystemMonitoring] = useState(false);
  const [archivedDocuments, setArchivedDocuments] = useState([]);
  const [isLoadingArchive, setIsLoadingArchive] = useState(false);
  const [users, setUsers] = useState([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [systemMetrics, setSystemMetrics] = useState(null);
  const [systemHealth, setSystemHealth] = useState(null);
  const [systemLogs, setSystemLogs] = useState([]);
  const [isLoadingSystem, setIsLoadingSystem] = useState(false);
  
  // Новые состояния для продвинутого мониторинга (аккуратно добавляем)
  const [systemAlerts, setSystemAlerts] = useState(null);
  const [realTimeMetrics, setRealTimeMetrics] = useState(null);
  const [lastUpdateTime, setLastUpdateTime] = useState(new Date());
  
  // Информация о системе
  const [systemInfo, setSystemInfo] = useState<any>(null);
  
  // Загружаем документы на модерацию и информацию о системе
  useEffect(() => {
    const fetchPendingDocuments = async () => {
      try {
        const response = await fetch('/api/admin/documents/pending', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
          }
        });
        if (response.ok) {
          const docs = await response.json();
          setPendingDocuments(docs);
        } else if (response.status === 403 || response.status === 401) {
          // Токен истек - выходим из админ панели
          console.log('Токен истек, требуется повторная авторизация');
          localStorage.removeItem('accessToken');
          localStorage.removeItem('currentUser');
          onBack(); // Выходим из админ панели
          return; // Прерываем выполнение
        }
      } catch (error) {
        console.error('Ошибка загрузки документов на модерацию:', error);
      } finally {
        setIsLoadingDocs(false);
      }
    };

    // Загружаем информацию о системе
    const fetchSystemInfo = async () => {
      try {
        const response = await fetch('/api/admin/system/info', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
          }
        });
        if (response.ok) {
          const info = await response.json();
          setSystemInfo(info);
        }
      } catch (error) {
        console.error('Ошибка загрузки информации о системе:', error);
      }
    };

    // Алерты нужны карточке на главной сразу, а не только после открытия мониторинга
    const fetchAlerts = async () => {
      try {
        const response = await fetch('/api/admin/monitoring/alerts', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` }
        });
        if (response.ok) setSystemAlerts(await response.json());
      } catch (error) {
        console.error('Ошибка загрузки алертов:', error);
      }
    };

    fetchPendingDocuments();
    fetchSystemInfo();
    fetchAlerts();
    // Обновляем каждые 30 секунд
    const interval = setInterval(() => {
      fetchPendingDocuments();
      fetchSystemInfo();
      fetchAlerts();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Автоматическое обновление системного мониторинга (аккуратно добавляем)
  useEffect(() => {
    if (showSystemMonitoring) {
      // Обновляем каждые 10 секунд при открытом мониторинге
      const interval = setInterval(fetchSystemData, 10000);
      return () => clearInterval(interval);
    }
    return undefined;
  }, [showSystemMonitoring]);

  // Функция для обновления статуса документа
  const updateDocumentStatus = async (docId: string, status: string, reason?: string) => {
    try {
      const response = await fetch(`/api/documents/${docId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
        },
        body: JSON.stringify({
          status,
          changeReason: reason,
          verificationNotes: status === 'verified' ? 'Утверждено администратором' : 'Отклонено администратором'
        })
      });

      if (response.ok) {
        // Обновляем список документов
        setPendingDocuments(prev => prev.filter((doc: any) => doc.id !== docId));
        return true;
      } else {
        console.error('Ошибка обновления статуса документа');
        return false;
      }
    } catch (error) {
      console.error('Ошибка при обновлении документа:', error);
      return false;
    }
  };

  // Функция для загрузки пользователей
  const fetchUsers = async () => {
    setIsLoadingUsers(true);
    try {
      const response = await fetch('/api/admin/users?page=1&limit=50', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setUsers(data.users || []);
      } else {
        console.error('Ошибка загрузки пользователей:', response.status);
      }
    } catch (error) {
      console.error('Ошибка при загрузке пользователей:', error);
    } finally {
      setIsLoadingUsers(false);
    }
  };

  // Функция для загрузки архивных документов
  const fetchArchivedDocuments = async () => {
    setIsLoadingArchive(true);
    try {
      const response = await fetch('/api/admin/documents/archived', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
        }
      });
      if (response.ok) {
        const docs = await response.json();
        setArchivedDocuments(docs);
      } else if (response.status === 403 || response.status === 401) {
        // Токен истек - выходим из админ панели  
        console.log('Токен истек, требуется повторная авторизация');
        localStorage.removeItem('accessToken');
        localStorage.removeItem('currentUser');
        onBack(); // Выходим из админ панели
        return;
      } else {
        console.error('Ошибка загрузки архивных документов:', response.status);
      }
    } catch (error) {
      console.error('Ошибка при загрузке архивных документов:', error);
    } finally {
      setIsLoadingArchive(false);
    }
  };

  // Функция для загрузки системных метрик (расширенная версия)
  const fetchSystemData = async () => {
    setIsLoadingSystem(true);
    try {
      const [statusResponse, logsResponse, alertsResponse, realtimeResponse] = await Promise.all([
        // статус в тех полях, что показывает SystemMonitoring: база, API, память, нагрузка, диск
        fetch('/api/admin/system/status', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` }
        }),
        fetch('/api/admin/system/logs?limit=50', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` }
        }),
        // Новые endpoints для продвинутого мониторинга
        fetch('/api/admin/monitoring/alerts', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` }
        }),
        fetch('/api/admin/monitoring/realtime', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` }
        })
      ]);

      if (statusResponse.ok) {
        const status = await statusResponse.json();
        setSystemHealth(status.health);
        setSystemMetrics(status.metrics);
      }
      
      if (logsResponse.ok) {
        const logs = await logsResponse.json();
        setSystemLogs(logs);
      }

      // Новые данные для продвинутого мониторинга
      if (alertsResponse.ok) {
        const alerts = await alertsResponse.json();
        setSystemAlerts(alerts);
      }

      if (realtimeResponse.ok) {
        const realtime = await realtimeResponse.json();
        setRealTimeMetrics(realtime);
      }

      setLastUpdateTime(new Date());
    } catch (error) {
      console.error('Ошибка при загрузке системных данных:', error);
    } finally {
      setIsLoadingSystem(false);
    }
  };

  const adminRoles = {
    super_admin: 'Супер Администратор',
    devops_admin: 'DevOps Администратор', 
    analytics_admin: 'Аналитический Администратор',
    finance_admin: 'Финансовый Администратор',
    api_admin: 'API Администратор',
    security_admin: 'Администратор Безопасности'
  };

  const adminPermissions = {
    super_admin: ['Полный доступ', 'Управление пользователями', 'Системные настройки'],
    devops_admin: ['Мониторинг системы', 'Производительность', 'Логи системы'],
    analytics_admin: ['Просмотр аналитики', 'Экспорт отчетов', 'Метрики пользователей'],
    finance_admin: ['Просмотр транзакций', 'Управление банками', 'Финансовые отчеты'],
    api_admin: ['Мониторинг API', 'Управление интеграциями', 'Статус сервисов'],
    security_admin: ['Мониторинг безопасности', 'Логи аутентификации', 'Анализ угроз']
  };

  const userRole = user.adminRole || 'super_admin';

  return (
    <div style={{ padding: '20px', backgroundColor: '#f8f9fa', minHeight: '100vh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '30px' }}>
        <div>
          <h1 style={{ margin: '0 0 10px 0', color: '#333' }}>🛡️ Админ-панель FinTrack</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ color: '#666' }}>Роль:</span>
            <span style={{ 
              backgroundColor: '#dc3545', 
              color: 'white', 
              padding: '4px 8px', 
              borderRadius: '4px',
              fontSize: '14px',
              fontWeight: '500'
            }}>
              {adminRoles[userRole as keyof typeof adminRoles]}
            </span>
            {adminPermissions[userRole as keyof typeof adminPermissions].map((permission: string, idx: number) => (
              <span key={idx} style={{
                backgroundColor: '#007bff',
                color: 'white',
                padding: '4px 10px',
                borderRadius: '15px',
                fontSize: '12px'
              }}>
                {permission}
              </span>
            ))}
          </div>
        </div>
        <button 
          onClick={onBack}
          style={{ 
            padding: '10px 20px', 
            backgroundColor: '#6c757d', 
            color: 'white', 
            border: 'none', 
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500'
          }}
        >
          ← Пользовательский дашборд
        </button>
      </div>

      <AdminDashboardStats 
        pendingDocsCount={pendingDocuments.length}
        systemAlerts={systemAlerts}
        isLoadingDocs={isLoadingDocs}
      />

      {/* Быстрые действия */}
      <div style={{ backgroundColor: 'white', padding: '25px', borderRadius: '12px', border: '1px solid #e9ecef', marginBottom: '20px' }}>
        <h3 style={{ margin: '0 0 15px 0', color: '#333' }}>Быстрые действия</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
          {(userRole === 'super_admin' || userRole === 'analytics_admin') && (
            <button 
              onClick={() => {
                setShowUserManagement(!showUserManagement);
                if (!showUserManagement) {
                  fetchUsers();
                }
              }}
              style={{ 
                padding: '15px 20px', 
                backgroundColor: showUserManagement ? '#007bff' : '#28a745', 
                color: 'white', 
                border: 'none', 
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500'
              }}
            >
              📊 {showUserManagement ? 'Скрыть управление' : 'Управление пользователями'}
            </button>
          )}
          
          {(userRole === 'super_admin' || userRole === 'security_admin') && (
            <button 
              onClick={() => {
                setShowDocumentArchive(!showDocumentArchive);
                if (!showDocumentArchive) {
                  fetchArchivedDocuments();
                }
              }}
              style={{ 
                padding: '15px 20px', 
                backgroundColor: showDocumentArchive ? '#007bff' : '#17a2b8', 
                color: 'white', 
                border: 'none', 
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500'
              }}
            >
              🗃️ {showDocumentArchive ? 'Скрыть архив' : 'Архив документов'}
            </button>
          )}
          
          {(userRole === 'super_admin' || userRole === 'devops_admin') && (
            <button 
              onClick={() => {
                setShowSystemMonitoring(!showSystemMonitoring);
                if (!showSystemMonitoring) {
                  fetchSystemData();
                }
              }}
              style={{ 
                padding: '15px 20px', 
                backgroundColor: showSystemMonitoring ? '#6f42c1' : '#6c757d', 
                color: 'white', 
                border: 'none', 
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500'
              }}
            >
              🔧 {showSystemMonitoring ? 'Скрыть мониторинг' : 'Системный мониторинг'}
            </button>
          )}
          
        </div>
      </div>

      <PendingDocumentsList 
        documents={pendingDocuments}
        isLoading={isLoadingDocs}
        onUpdateStatus={updateDocumentStatus}
      />

      {showUserManagement && (
        <UserManagement 
          isVisible={true}
          users={users}
          isLoading={isLoadingUsers}
          userRole={userRole}
        />
      )}

      {showDocumentArchive && (
        <DocumentArchive 
          isVisible={true}
          documents={archivedDocuments}
          isLoading={isLoadingArchive}
        />
      )}

      {/* Системный мониторинг */}
      {showSystemMonitoring && (
        <SystemMonitoring 
          isVisible={true}
          systemHealth={systemHealth}
          systemMetrics={systemMetrics}
          activityLogs={systemLogs}
          isLoading={isLoadingSystem}
        />
      )}

      <AppSettings canEdit={userRole === 'super_admin'} />

      <div style={{ backgroundColor: 'white', padding: '25px', borderRadius: '12px', border: '1px solid #e9ecef' }}>
        <h3 style={{ margin: '0 0 15px 0', color: '#333' }}>Системная информация</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '15px' }}>
          <div style={{ padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
            <strong>Версия системы:</strong><br />
            <span style={{ color: '#666' }}>
              {systemInfo ? `v${systemInfo.version} (${systemInfo.environment || 'Стабильная'})` : 'Загрузка...'}
            </span>
          </div>
          <div style={{ padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
            <strong>Последнее обновление:</strong><br />
            <span style={{ color: '#666' }}>
              {systemInfo ? (systemInfo.lastUpdate ? new Date(systemInfo.lastUpdate).toLocaleString('ru-RU') : 'Недоступно') : 'Загрузка...'}
            </span>
          </div>
          <div style={{ padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
            <strong>BD подключения:</strong><br />
            <span style={{ color: '#666' }}>
              {systemInfo ? `${systemInfo.dbConnections || 0}/${systemInfo.maxDbConnections || '∞'}` : 'Загрузка...'}
            </span>
          </div>
          <div style={{ padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
            <strong>Статус памяти:</strong><br />
            <span style={{ color: '#666' }}>
              {systemInfo ? `${systemInfo.memoryUsage || '0'}% используется` : 'Загрузка...'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminPanel;
