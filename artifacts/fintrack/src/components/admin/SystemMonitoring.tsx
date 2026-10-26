interface SystemMonitoringProps {
  isVisible: boolean;
  isLoading: boolean;
  systemHealth: any;
  systemMetrics: any;
  activityLogs: any[];
}

export function SystemMonitoring({ 
  isVisible, 
  isLoading, 
  systemHealth, 
  systemMetrics, 
  activityLogs 
}: SystemMonitoringProps) {
  if (!isVisible) return null;

  return (
    <div style={{ backgroundColor: 'var(--card)', padding: '25px', borderRadius: '12px', border: '1px solid var(--border)', marginBottom: '20px' }}>
      <h2 style={{ margin: '0 0 15px 0', color: 'var(--foreground)' }}>🔧 Системный мониторинг</h2>
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '20px' }}>
          <div>Загрузка системных данных...</div>
        </div>
      ) : (
        <div>
          {/* Статус системы */}
          {systemHealth && (
            <div style={{ marginBottom: '20px' }}>
              <h3 style={{ margin: '0 0 10px 0', color: 'var(--foreground)' }}>Статус системы</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <span style={{
                  padding: '4px 12px',
                  borderRadius: '20px',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  backgroundColor: (systemHealth.database === 'healthy' && systemHealth.api === 'healthy' && systemHealth.system === 'healthy') ? 'var(--success)' : 'var(--warning-solid)',
                  color: 'var(--primary-foreground)'
                }}>
                  {(systemHealth.database === 'healthy' && systemHealth.api === 'healthy' && systemHealth.system === 'healthy') ? '✅ Система работает нормально' : '⚠️ Есть предупреждения'}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                <div style={{ padding: '10px', backgroundColor: 'var(--muted)', borderRadius: '6px' }}>
                  <strong>База данных:</strong> {systemHealth.database === 'healthy' ? '✅ Подключена' : '❌ Ошибка'} 
                </div>
                <div style={{ padding: '10px', backgroundColor: 'var(--muted)', borderRadius: '6px' }}>
                  <strong>API:</strong> {systemHealth.api === 'healthy' ? '✅ Работает' : '❌ Ошибка'}
                </div>
                <div style={{ padding: '10px', backgroundColor: 'var(--muted)', borderRadius: '6px' }}>
                  <strong>Система:</strong> {systemHealth.system === 'healthy' ? '✅ Работает' : '❌ Ошибка'}
                </div>
              </div>
            </div>
          )}

          {/* Системные метрики */}
          {systemMetrics && (
            <div style={{ marginBottom: '20px' }}>
              <h3 style={{ margin: '0 0 10px 0', color: 'var(--foreground)' }}>Системные метрики</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
                <div style={{ padding: '15px', backgroundColor: 'var(--primary-subtle)', borderRadius: '8px', border: '1px solid var(--primary-subtle)' }}>
                  <h4 style={{ margin: '0 0 10px 0', color: 'var(--primary)' }}>💾 Память</h4>
                  <div><strong>Используется:</strong> {systemMetrics.memory?.used} MB</div>
                  <div><strong>Всего:</strong> {systemMetrics.memory?.total} MB</div>
                  <div><strong>Свободно:</strong> {systemMetrics.memory?.free} MB</div>
                </div>
                
                <div style={{ padding: '15px', backgroundColor: 'var(--brand-accent-subtle)', borderRadius: '8px', border: '1px solid var(--brand-accent-subtle)' }}>
                  <h4 style={{ margin: '0 0 10px 0', color: 'var(--brand-accent)' }}>⏱️ Система</h4>
                  <div><strong>Uptime:</strong> {systemMetrics.uptime ? Math.floor(systemMetrics.uptime / 3600) + 'ч ' + Math.floor((systemMetrics.uptime % 3600) / 60) + 'м' : 'N/A'}</div>
                  <div><strong>Load:</strong> {typeof systemMetrics.load === 'number' ? `${systemMetrics.load.toFixed(2)}${systemMetrics.cpuCount ? ` из ${systemMetrics.cpuCount} ядер` : ''}` : 'N/A'}</div>
                  <div><strong>CPU:</strong> {systemMetrics.cpu ? (typeof systemMetrics.cpu === 'number' ? systemMetrics.cpu.toFixed(1) : parseFloat(systemMetrics.cpu).toFixed(1)) + '%' : 'N/A'}</div>
                </div>

                <div style={{ padding: '15px', backgroundColor: 'var(--success-subtle)', borderRadius: '8px', border: '1px solid var(--success-subtle)' }}>
                  <h4 style={{ margin: '0 0 10px 0', color: 'var(--success)' }}>💽 Диск</h4>
                  {systemMetrics.disk ? (
                    <>
                      <div><strong>Используется:</strong> {systemMetrics.disk.used} GB</div>
                      <div><strong>Всего:</strong> {systemMetrics.disk.total} GB</div>
                      <div><strong>Свободно:</strong> {systemMetrics.disk.available} GB</div>
                    </>
                  ) : <div>Каталог данных недоступен</div>}
                </div>
              </div>
            </div>
          )}

          {/* Логи активности */}
          {activityLogs && activityLogs.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <h3 style={{ margin: '0 0 10px 0', color: 'var(--foreground)' }}>📋 Журнал активности (последние 10 записей)</h3>
              <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '6px' }}>
                {activityLogs.slice(0, 10).map((log: any, idx: number) => (
                  <div key={idx} style={{
                    padding: '8px 12px',
                    borderBottom: idx === activityLogs.slice(0, 10).length - 1 ? 'none' : '1px solid var(--border)',
                    backgroundColor: idx % 2 === 0 ? 'var(--muted)' : 'var(--card)'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 'bold', color: 'var(--foreground)' }}>
                        {log.action} - {log.entityType}
                      </span>
                      <span style={{ color: 'var(--muted-foreground)', fontSize: '11px' }}>
                        {new Date(log.createdAt).toLocaleString('ru-RU')}
                      </span>
                    </div>
                    {log.details && (
                      <div style={{ color: 'var(--muted-foreground)', marginTop: '4px' }}>
                        {typeof log.details === 'string' ? log.details : JSON.stringify(log.details)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}