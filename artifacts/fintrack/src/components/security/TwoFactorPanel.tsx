import { useEffect, useState } from 'react';

interface SetupData {
  qrCodeUrl: string;
  manualEntryKey: string;
  backupCodes: string[];
}

const authHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
});

const box = { border: '1px solid var(--border)', borderRadius: '8px', padding: '20px' };
const input = { padding: '10px 12px', border: '2px solid var(--border)', borderRadius: '6px', fontSize: '16px', width: '160px', letterSpacing: '0.2em' };
const primary = (disabled: boolean) => ({ background: disabled ? 'var(--muted-foreground)' : 'var(--primary)', color: 'var(--primary-foreground)', border: 'none', borderRadius: '6px', padding: '10px 16px', fontSize: '14px', cursor: disabled ? 'default' : 'pointer' });

export function TwoFactorPanel() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [setup, setSetup] = useState<SetupData | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    fetch('/api/auth/2fa/status', { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => setEnabled(Boolean(data.twoFactorEnabled)))
      .catch(() => setError('Не удалось получить статус двухфакторной защиты'));
  }, []);

  const call = async (path: string, body?: object) => {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(path, { method: 'POST', headers: authHeaders(), body: body ? JSON.stringify(body) : undefined });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Не удалось выполнить действие');
      return data;
    } finally {
      setBusy(false);
    }
  };

  const startSetup = async () => {
    try {
      setSetup(await call('/api/auth/2fa/setup'));
      setCode('');
      setNotice('');
    } catch (e: any) {
      setError(e.message);
    }
  };

  const enable = async () => {
    try {
      await call('/api/auth/2fa/enable', { verificationCode: code });
      setEnabled(true);
      setSetup(null);
      setCode('');
      setNotice('Двухфакторная защита включена. Теперь при входе понадобится код из приложения.');
    } catch (e: any) {
      setError(e.message);
    }
  };

  const disable = async () => {
    try {
      await call('/api/auth/2fa/disable', { code });
      setEnabled(false);
      setCode('');
      setNotice('Двухфакторная защита отключена.');
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div style={box} data-testid="two-factor-panel">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '6px' }}>
        <h3 style={{ margin: 0, color: 'var(--foreground)', fontSize: '18px' }}>Двухфакторная защита</h3>
        {enabled !== null && (
          <span style={{ fontSize: '12px', fontWeight: 600, padding: '2px 10px', borderRadius: '999px', color: enabled ? 'var(--success)' : 'var(--muted-foreground)', background: enabled ? 'var(--success-subtle)' : 'var(--muted)' }}>
            {enabled ? 'включена' : 'выключена'}
          </span>
        )}
      </div>
      <p style={{ margin: '0 0 16px 0', color: 'var(--muted-foreground)', fontSize: '14px' }}>
        При входе, кроме пароля, нужен код из приложения-аутентификатора: Яндекс Ключ, Google Authenticator и другие.
      </p>

      {error && <div style={{ marginBottom: '12px', color: 'var(--destructive)', fontSize: '14px' }}>{error}</div>}
      {notice && <div style={{ marginBottom: '12px', color: 'var(--success)', fontSize: '14px' }}>{notice}</div>}

      {enabled === false && !setup && (
        <button type="button" onClick={startSetup} disabled={busy} style={primary(busy)} data-testid="button-2fa-setup">
          {busy ? 'Готовим…' : 'Настроить'}
        </button>
      )}

      {enabled === false && setup && (
        <div style={{ display: 'grid', gap: '16px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'flex-start' }}>
            <img src={setup.qrCodeUrl} alt="QR-код для приложения-аутентификатора" width={160} height={160} style={{ border: '1px solid var(--border)', borderRadius: '6px' }} />
            <div style={{ minWidth: 0, flex: '1 1 220px', fontSize: '14px', color: 'var(--foreground)' }}>
              <div style={{ marginBottom: '6px' }}>1. Отсканируйте QR-код в приложении или введите ключ вручную:</div>
              <code style={{ display: 'block', wordBreak: 'break-all', background: 'var(--muted)', padding: '8px', borderRadius: '4px', fontSize: '13px' }} data-testid="text-2fa-key">{setup.manualEntryKey}</code>
            </div>
          </div>
          <div style={{ fontSize: '14px', color: 'var(--foreground)' }}>
            <div style={{ marginBottom: '6px' }}>2. Сохраните резервные коды. Каждый срабатывает один раз, если телефон потерян. Больше они не покажутся.</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '6px', fontFamily: 'monospace' }} data-testid="list-2fa-backup-codes">
              {setup.backupCodes.map((backupCode) => (
                <span key={backupCode} style={{ background: 'var(--muted)', padding: '6px', borderRadius: '4px', textAlign: 'center' }}>{backupCode}</span>
              ))}
            </div>
          </div>
          <div style={{ fontSize: '14px', color: 'var(--foreground)' }}>
            <div style={{ marginBottom: '6px' }}>3. Введите код из приложения:</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="123456" style={input} data-testid="input-2fa-enable-code" />
              <button type="button" onClick={enable} disabled={busy || code.length !== 6} style={primary(busy || code.length !== 6)} data-testid="button-2fa-enable">
                {busy ? 'Проверяем…' : 'Включить'}
              </button>
            </div>
          </div>
        </div>
      )}

      {enabled && (
        <div style={{ fontSize: '14px', color: 'var(--foreground)' }}>
          <div style={{ marginBottom: '6px' }}>Чтобы отключить, введите код из приложения или резервный код:</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            <input value={code} onChange={(e) => setCode(e.target.value.trim().slice(0, 32))} inputMode="numeric" autoComplete="one-time-code" style={input} data-testid="input-2fa-disable-code" />
            <button type="button" onClick={disable} disabled={busy || code.length < 6} style={{ ...primary(busy || code.length < 6), background: busy || code.length < 6 ? 'var(--muted-foreground)' : 'var(--destructive)' }} data-testid="button-2fa-disable">
              {busy ? 'Отключаем…' : 'Отключить'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
