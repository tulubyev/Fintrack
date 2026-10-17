import { useEffect, useState } from 'react';
import { logoutSession } from '../../lib/sessionRefresh';

interface SessionInfo {
  id: string;
  deviceName: string | null;
  ipAddress: string | null;
  createdAt: string;
  lastUsedAt: string;
  current: boolean;
}

const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('accessToken')}` });

// Короткое имя устройства из User-Agent: браузер и система
function deviceLabel(userAgent: string | null): string {
  if (!userAgent) return 'Неизвестное устройство';
  const browser = /YaBrowser/.test(userAgent) ? 'Яндекс Браузер'
    : /Edg\//.test(userAgent) ? 'Edge'
    : /OPR\//.test(userAgent) ? 'Opera'
    : /Firefox\//.test(userAgent) ? 'Firefox'
    : /Chrome\//.test(userAgent) ? 'Chrome'
    : /Safari\//.test(userAgent) ? 'Safari'
    : 'Приложение';
  const os = /Android/.test(userAgent) ? 'Android'
    : /iPhone|iPad/.test(userAgent) ? 'iOS'
    : /Windows/.test(userAgent) ? 'Windows'
    : /Mac OS X/.test(userAgent) ? 'macOS'
    : /Linux/.test(userAgent) ? 'Linux'
    : '';
  return os ? `${browser}, ${os}` : browser;
}

const formatDate = (value: string) =>
  new Date(value).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

export function SessionsList({ onLoggedOutEverywhere }: { onLoggedOutEverywhere: () => void }) {
  const [sessions, setSessions] = useState<SessionInfo[] | null>(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setError('');
    try {
      const response = await fetch('/api/auth/sessions', { headers: authHeaders() });
      if (!response.ok) throw new Error();
      setSessions(await response.json());
    } catch {
      setError('Не удалось загрузить список устройств');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const endSession = async (session: SessionInfo) => {
    setBusyId(session.id);
    try {
      const response = await fetch(`/api/auth/sessions/${session.id}`, { method: 'DELETE', headers: authHeaders() });
      if (!response.ok) throw new Error();
      if (session.current) {
        await logoutSession();
        onLoggedOutEverywhere();
        return;
      }
      setSessions((prev) => prev?.filter((s) => s.id !== session.id) ?? null);
    } catch {
      setError('Не удалось завершить сеанс');
    } finally {
      setBusyId(null);
    }
  };

  const logoutEverywhere = async () => {
    setBusyId('all');
    try {
      const response = await fetch('/api/auth/logout-all', { method: 'POST', headers: authHeaders() });
      if (!response.ok) throw new Error();
    } catch {
      // Другие сеансы могли остаться активными — не делаем вид, что выход удался
      setError('Не удалось завершить сеансы на других устройствах. Попробуйте ещё раз');
      setBusyId(null);
      return;
    }
    await logoutSession();
    onLoggedOutEverywhere();
  };

  return (
    <div style={{ border: '1px solid #e9ecef', borderRadius: '8px', padding: '20px' }} data-testid="sessions-list">
      <h3 style={{ margin: '0 0 6px 0', color: '#333', fontSize: '18px' }}>Устройства и сеансы</h3>
      <p style={{ margin: '0 0 16px 0', color: '#666', fontSize: '14px' }}>
        Где выполнен вход в ваш аккаунт. Если устройство вам незнакомо, завершите его сеанс и смените пароль.
      </p>

      {error && <div style={{ marginBottom: '12px', color: '#b02a37', fontSize: '14px' }}>{error}</div>}
      {!sessions && !error && <div style={{ color: '#666', fontSize: '14px' }}>Загрузка…</div>}

      {sessions && (
        <div style={{ display: 'grid', gap: '10px' }}>
          {sessions.map((session) => (
            <div key={session.id} style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: '#f8f9fa', borderRadius: '6px' }} data-testid="session-row">
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 500, color: '#333' }}>
                  {deviceLabel(session.deviceName)}
                  {session.current && <span style={{ marginLeft: '8px', fontSize: '12px', color: '#1b5e20', background: '#e8f5e9', padding: '2px 8px', borderRadius: '999px' }}>это устройство</span>}
                </div>
                <div style={{ fontSize: '13px', color: '#666' }}>
                  Последняя активность: {formatDate(session.lastUsedAt)}{session.ipAddress ? ` · IP ${session.ipAddress}` : ''}
                </div>
              </div>
              <button
                type="button"
                onClick={() => endSession(session)}
                disabled={busyId !== null}
                style={{ background: 'none', border: '1px solid #dc3545', color: '#dc3545', borderRadius: '6px', padding: '6px 12px', fontSize: '14px', cursor: busyId ? 'default' : 'pointer' }}
              >
                {busyId === session.id ? 'Завершаем…' : session.current ? 'Выйти' : 'Завершить'}
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={logoutEverywhere}
        disabled={busyId !== null}
        style={{ marginTop: '16px', background: '#dc3545', color: 'white', border: 'none', borderRadius: '6px', padding: '10px 16px', fontSize: '14px', cursor: busyId ? 'default' : 'pointer' }}
        data-testid="button-logout-all"
      >
        {busyId === 'all' ? 'Выходим…' : 'Выйти на всех устройствах'}
      </button>
    </div>
  );
}
