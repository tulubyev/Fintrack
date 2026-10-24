import { useEffect, useState } from 'react';

interface BooleanSetting {
  enabled: boolean;
  source: 'admin' | 'env';
  envDefault: boolean;
}

const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('accessToken')}` });

/**
 * Настройки приложения (services/appSettings.ts на сервере). Значение по умолчанию — .env,
 * супер-администратор может перекрыть его или вернуть к .env; остальные администраторы только видят.
 */
export function AppSettings({ canEdit }: { canEdit: boolean }) {
  const [biometrics, setBiometrics] = useState<BooleanSetting | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/settings', { headers: authHeaders() })
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((data) => setBiometrics(data.mobileBiometrics))
      .catch(() => setError('Не удалось загрузить настройки'));
  }, []);

  const save = async (value: boolean | null) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobileBiometrics: value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? 'Не удалось сохранить');
      setBiometrics(data.mobileBiometrics);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  const button = (label: string, value: boolean | null, testId: string) => (
    <button
      onClick={() => save(value)}
      disabled={saving}
      data-testid={testId}
      style={{ padding: '8px 14px', border: '1px solid #ced4da', borderRadius: '6px', backgroundColor: 'white', cursor: saving ? 'default' : 'pointer', fontSize: '14px' }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ backgroundColor: 'white', padding: '25px', borderRadius: '12px', border: '1px solid #e9ecef', marginBottom: '20px' }} data-testid="admin-app-settings">
      <h3 style={{ margin: '0 0 15px 0', color: '#333' }}>⚙️ Настройки приложения</h3>
      {error && <div style={{ color: '#dc3545', marginBottom: '10px' }}>{error}</div>}
      {biometrics && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 600 }}>Вход по отпечатку или Face ID в мобильном приложении</div>
            <div style={{ color: '#6c757d', fontSize: '14px', marginTop: '4px' }} data-testid="biometrics-status">
              {biometrics.enabled ? 'Включён' : 'Выключен'} ·{' '}
              {biometrics.source === 'admin'
                ? `задано администратором (в .env: ${biometrics.envDefault ? 'включён' : 'выключен'})`
                : 'по значению MOBILE_BIOMETRICS_ENABLED в .env'}
            </div>
            <div style={{ color: '#6c757d', fontSize: '13px', marginTop: '4px' }}>
              Позиция FinTrack — приложения не собирают биометрию, поэтому по умолчанию выключено. При выключении приложение
              перестаёт предлагать вход по биометрии и отключает его у тех, кто включил.
            </div>
          </div>
          {canEdit && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {biometrics.enabled ? button('Выключить', false, 'biometrics-off') : button('Включить', true, 'biometrics-on')}
              {biometrics.source === 'admin' && button('Как в .env', null, 'biometrics-reset')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
