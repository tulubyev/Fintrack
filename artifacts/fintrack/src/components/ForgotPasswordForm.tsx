import { useEffect, useState } from 'react';
import { phoneMask, formatPhoneToInternational, validateRussianPhone } from '../utils/phoneUtils';

type Step = 'request' | 'reset' | 'done';

const inputStyle = {
  width: '100%',
  padding: '12px 16px',
  border: '2px solid var(--border)',
  borderRadius: '8px',
  fontSize: '16px',
  outline: 'none',
  boxSizing: 'border-box' as const,
};

const labelStyle = {
  display: 'block',
  marginBottom: '6px',
  fontSize: '14px',
  fontWeight: '500',
  color: 'var(--foreground)',
};

const primaryButton = (disabled: boolean) => ({
  width: '100%',
  padding: '12px',
  background: disabled ? 'var(--muted-foreground)' : 'var(--primary)',
  color: 'var(--primary-foreground)',
  border: 'none',
  borderRadius: '8px',
  fontSize: '16px',
  fontWeight: '600',
  cursor: disabled ? 'not-allowed' : 'pointer',
  boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)',
});

const linkButton = {
  background: 'none',
  border: 'none',
  color: 'var(--primary)',
  fontSize: '14px',
  cursor: 'pointer',
  padding: 0,
};

// Сервер отправляет код не чаще раза в минуту — столько же ждёт кнопка повторной отправки
const RESEND_COOLDOWN_SECONDS = 60;

const PASSWORD_HINT = 'Не меньше 12 символов: заглавная и строчная буквы, цифра и один из символов !@#$%^&*';

export function ForgotPasswordForm({ onBack, initialIdentifier = '' }: { onBack: () => void; initialIdentifier?: string }) {
  const [step, setStep] = useState<Step>('request');
  const [identifier, setIdentifier] = useState(initialIdentifier);
  const [channel, setChannel] = useState<'sms' | 'email'>(initialIdentifier.includes('@') ? 'email' : 'sms');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendNotice, setResendNotice] = useState('');
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  // Тот же формат, что и при входе: телефон приводим к +7XXXXXXXXXX
  const normalizedIdentifier = () => {
    if (identifier.includes('@')) return identifier.trim();
    return formatPhoneToInternational(identifier);
  };

  const handleIdentifierChange = (value: string) => {
    const looksLikePhone = !value.includes('@') && !/[a-zA-Z]/.test(value) && /^[+78]|^\d+$/.test(value.replace(/[\s\-()]/g, ''));
    setIdentifier(looksLikePhone ? phoneMask(value) : value);
    if (value.includes('@')) setChannel('email');
  };

  const requestCode = async (e?: any, resend = false) => {
    e?.preventDefault();
    setError('');
    setResendNotice('');
    const id = normalizedIdentifier();
    if (!id.includes('@') && !validateRussianPhone(id)) {
      setError('Введите email или корректный российский номер телефона');
      return;
    }
    const setBusy = resend ? setIsResending : setIsLoading;
    setBusy(true);
    try {
      const response = await fetch('/api/auth/password/forgot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: id, channel }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.message || 'Не удалось отправить код');
        return;
      }
      setMessage(data.message);
      setStep('reset');
      setCooldown(RESEND_COOLDOWN_SECONDS);
      if (resend) setResendNotice('Код отправлен повторно. Предыдущий код больше не действует.');
    } catch {
      setError('Не удалось отправить код. Проверьте соединение');
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async (e: any) => {
    e.preventDefault();
    setError('');
    if (newPassword !== confirmPassword) {
      setError('Пароли не совпадают');
      return;
    }
    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/password/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: normalizedIdentifier(), code, newPassword }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.message || 'Не удалось изменить пароль');
        return;
      }
      setMessage(data.message);
      setStep('done');
    } catch {
      setError('Не удалось изменить пароль. Проверьте соединение');
    } finally {
      setIsLoading(false);
    }
  };

  const errorBox = error && (
    <div style={{ marginBottom: '16px', padding: '10px 12px', borderRadius: '8px', background: 'var(--destructive-subtle)', color: 'var(--destructive)', fontSize: '14px' }} data-testid="text-reset-error">
      {error}
    </div>
  );

  if (step === 'done') {
    return (
      <div>
        <div style={{ marginBottom: '20px', padding: '12px', borderRadius: '8px', background: 'var(--success-subtle)', color: 'var(--success)', fontSize: '14px' }} data-testid="text-reset-done">
          ✅ {message}
        </div>
        <button type="button" onClick={onBack} style={primaryButton(false)} data-testid="button-reset-back-to-login">
          Вернуться ко входу
        </button>
      </div>
    );
  }

  if (step === 'reset') {
    return (
      <form onSubmit={resetPassword}>
        <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: 'var(--muted-foreground)' }}>
          {message}. Код действует 15 минут.
        </p>
        {resendNotice && (
          <div style={{ marginBottom: '16px', padding: '10px 12px', borderRadius: '8px', background: 'var(--success-subtle)', color: 'var(--success)', fontSize: '14px' }} data-testid="text-reset-resent">
            {resendNotice}
          </div>
        )}
        {errorBox}
        <div style={{ marginBottom: '16px' }}>
          <label style={labelStyle}>🔢 Код из {channel === 'email' ? 'письма' : 'SMS'}</label>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="123456"
            required
            style={inputStyle}
            data-testid="input-reset-code"
          />
        </div>
        <div style={{ marginBottom: '16px' }}>
          <label style={labelStyle}>🔐 Новый пароль</label>
          <input
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            style={inputStyle}
            data-testid="input-reset-new-password"
          />
          <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--muted-foreground)' }}>{PASSWORD_HINT}</div>
        </div>
        <div style={{ marginBottom: '20px' }}>
          <label style={labelStyle}>🔐 Повторите пароль</label>
          <input
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            style={inputStyle}
            data-testid="input-reset-confirm-password"
          />
        </div>
        <button type="submit" disabled={isLoading} style={primaryButton(isLoading)} data-testid="button-submit-reset">
          {isLoading ? '⏳ Сохраняем...' : 'Сохранить новый пароль'}
        </button>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px' }}>
          <button
            type="button"
            onClick={() => requestCode(undefined, true)}
            disabled={isLoading || isResending || cooldown > 0}
            style={{ ...linkButton, ...(isResending || cooldown > 0 ? { color: 'var(--muted-foreground)', cursor: 'default' } : {}) }}
            data-testid="button-reset-resend"
          >
            {isResending ? '⏳ Отправляем...' : cooldown > 0 ? `Отправить ещё раз через ${cooldown} с` : 'Отправить код ещё раз'}
          </button>
          <button type="button" onClick={onBack} style={linkButton}>Ко входу</button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={requestCode}>
      <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: 'var(--muted-foreground)' }}>
        Укажите email или телефон, с которым вы регистрировались. Мы пришлём код для смены пароля.
      </p>
      {errorBox}
      <div style={{ marginBottom: '16px' }}>
        <label style={labelStyle}>📧 Email или 📱 Телефон</label>
        <input
          type="text"
          value={identifier}
          onChange={(e) => handleIdentifierChange(e.target.value)}
          placeholder="user@example.com или +7 ___ ___-__-__"
          required
          style={inputStyle}
          data-testid="input-reset-identifier"
        />
      </div>
      <div style={{ marginBottom: '20px', fontSize: '14px', color: 'var(--foreground)' }}>
        <div style={{ marginBottom: '6px', fontWeight: '500' }}>Куда отправить код</div>
        <label style={{ marginRight: '16px', cursor: 'pointer' }}>
          <input type="radio" name="reset-channel" checked={channel === 'sms'} onChange={() => setChannel('sms')} data-testid="radio-reset-sms" /> SMS на телефон
        </label>
        <label style={{ cursor: 'pointer' }}>
          <input type="radio" name="reset-channel" checked={channel === 'email'} onChange={() => setChannel('email')} data-testid="radio-reset-email" /> Письмо на почту
        </label>
      </div>
      <button type="submit" disabled={isLoading} style={primaryButton(isLoading)} data-testid="button-submit-forgot">
        {isLoading ? '⏳ Отправляем...' : 'Получить код'}
      </button>
      <div style={{ textAlign: 'center', marginTop: '16px' }}>
        <button type="button" onClick={onBack} style={linkButton}>Вспомнил пароль — ко входу</button>
      </div>
    </form>
  );
}
