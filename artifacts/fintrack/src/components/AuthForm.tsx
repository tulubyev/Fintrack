import { useState } from 'react';
import { phoneMask, formatPhoneToInternational, validateRussianPhone } from '../utils/phoneUtils';
import { ForgotPasswordForm } from './ForgotPasswordForm';

export function AuthForm({ onAuthSuccess }: any) {
  const [mode, setMode] = useState('login');
  const [isLoading, setIsLoading] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [loginForm, setLoginForm] = useState({
    identifier: '',
    password: ''
  });
  const [registerForm, setRegisterForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: ''
  });

  const handleLogin = async (e: any) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      let identifier = loginForm.identifier;
      
      // Если введён номер телефона, форматируем его
      if (identifier && !identifier.includes('@')) {
        identifier = formatPhoneToInternational(identifier);
        
        // Валидируем российский номер
        if (!validateRussianPhone(identifier)) {
          alert('Введите корректный российский номер телефона');
          setIsLoading(false);
          return;
        }
      }
      
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: identifier,
          password: loginForm.password
        })
      });

      if (response.ok) {
        const data = await response.json();
        localStorage.setItem('accessToken', data.accessToken);
        localStorage.setItem('refreshToken', data.refreshToken);
        onAuthSuccess(data.user);
      } else {
        const errorData = await response.json();
        alert(errorData.message || 'Ошибка входа');
      }
    } catch (error: any) {
      console.error('Login error:', error);
      alert('Ошибка при входе в систему');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: any) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const formattedPhone = formatPhoneToInternational(registerForm.phone);
      
      // Валидируем российский номер
      if (!validateRussianPhone(formattedPhone)) {
        alert('Введите корректный российский номер телефона');
        setIsLoading(false);
        return;
      }

      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: registerForm.firstName,
          lastName: registerForm.lastName,
          email: registerForm.email,
          phone: formattedPhone,
          password: registerForm.password
        })
      });

      if (response.ok) {
        const data = await response.json();
        localStorage.setItem('accessToken', data.accessToken);
        localStorage.setItem('refreshToken', data.refreshToken);
        onAuthSuccess(data.user);
      } else {
        const errorData = await response.json();
        alert(errorData.message || 'Ошибка регистрации');
      }
    } catch (error: any) {
      console.error('Registration error:', error);
      alert('Ошибка при регистрации');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoginPhoneChange = (e: any) => {
    const maskedPhone = phoneMask(e.target.value);
    setLoginForm(prev => ({ ...prev, identifier: maskedPhone }));
  };

  const handleRegisterPhoneChange = (e: any) => {
    const maskedPhone = phoneMask(e.target.value);
    setRegisterForm(prev => ({ ...prev, phone: maskedPhone }));
  };

  const isEmailField = loginForm.identifier.includes('@');

  return (
    <div style={{ 
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '16px',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.1)',
        width: '100%',
        maxWidth: '400px',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
          textAlign: 'center',
          padding: '30px 20px'
        }}>
          <h1 style={{ 
            margin: '0 0 10px 0', 
            fontSize: '28px', 
            fontWeight: '600',
            letterSpacing: '-0.5px'
          }}>
            💎 FinTrack
          </h1>
          <p style={{ 
            margin: '0', 
            fontSize: '16px', 
            opacity: '0.9',
            fontWeight: '400'
          }}>
            Умный финансовый агрегатор
          </p>
        </div>

        {/* Tab Buttons */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid #e9ecef'
        }}>
          <button
            onClick={() => setMode('login')}
            style={{
              flex: 1,
              padding: '15px',
              border: 'none',
              backgroundColor: mode === 'login' ? '#f8f9fa' : 'white',
              color: mode === 'login' ? '#007bff' : '#6c757d',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
            data-testid="button-login-tab"
          >
            🔑 Вход
          </button>
          <button
            onClick={() => setMode('register')}
            style={{
              flex: 1,
              padding: '15px',
              border: 'none',
              backgroundColor: mode === 'register' ? '#f8f9fa' : 'white',
              color: mode === 'register' ? '#007bff' : '#6c757d',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
              borderLeft: '1px solid #e9ecef',
              transition: 'all 0.2s ease'
            }}
            data-testid="button-register-tab"
          >
            ✨ Регистрация
          </button>
        </div>

        {/* Form Content */}
        <div style={{ padding: '30px' }}>
          {mode === 'forgot' ? (
            <ForgotPasswordForm onBack={() => setMode('login')} initialIdentifier={loginForm.identifier} />
          ) : mode === 'login' ? (
            <form onSubmit={handleLogin}>
              <div style={{ marginBottom: '20px' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '6px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#333'
                }}>
                  📧 Email или 📱 Телефон
                </label>
                <input
                  type="text"
                  value={loginForm.identifier}
                  onChange={(e) => {
                    const value = e.target.value;
                    // Check if input looks like a phone (starts with +, 7, 8, 9, or is only digits)
                    const isPhoneInput = /^[+78９]|^\d+$/.test(value.replace(/[\s\-()]/g, ''));
                    
                    if (value.includes('@') || /[a-zA-Z]/.test(value)) {
                      // Contains @ or letters - treat as email
                      setLoginForm(prev => ({ ...prev, identifier: value }));
                    } else if (isPhoneInput) {
                      // Looks like a phone number - apply mask
                      const maskedPhone = phoneMask(value);
                      setLoginForm(prev => ({ ...prev, identifier: maskedPhone }));
                    } else {
                      // Allow any other input
                      setLoginForm(prev => ({ ...prev, identifier: value }));
                    }
                  }}
                  placeholder="Email (user@example.com) или 📱 +7 (___) ___-__-__"
                  required
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: '2px solid #e9ecef',
                    borderRadius: '8px',
                    fontSize: '16px',
                    transition: 'border-color 0.2s ease',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#007bff'}
                  onBlur={(e) => e.target.style.borderColor = '#e9ecef'}
                  data-testid="input-login-identifier"
                />
              </div>

              <div style={{ marginBottom: '25px' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '6px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#333'
                }}>
                  🔐 Пароль
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showLoginPassword ? 'text' : 'password'}
                    value={loginForm.password}
                    onChange={(e) => setLoginForm(prev => ({ ...prev, password: e.target.value }))}
                    placeholder="Введите пароль"
                    required
                    style={{
                      width: '100%',
                      padding: '12px 50px 12px 16px',
                      border: '2px solid #e9ecef',
                      borderRadius: '8px',
                      fontSize: '16px',
                      transition: 'border-color 0.2s ease',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#007bff'}
                    onBlur={(e) => e.target.style.borderColor = '#e9ecef'}
                    data-testid="input-login-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword(!showLoginPassword)}
                    style={{
                      position: 'absolute',
                      right: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      fontSize: '16px',
                      cursor: 'pointer',
                      color: '#6c757d'
                    }}
                    data-testid="button-toggle-login-password"
                  >
                    {showLoginPassword ? '🙈' : '👁️'}
                  </button>
                </div>
                <div style={{ textAlign: 'right', marginTop: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setMode('forgot')}
                    style={{ background: 'none', border: 'none', color: '#007bff', fontSize: '14px', cursor: 'pointer', padding: 0 }}
                    data-testid="button-forgot-password"
                  >
                    Забыли пароль?
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: isLoading ? '#6c757d' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '16px',
                  fontWeight: '600',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)'
                }}
                data-testid="button-submit-login"
              >
                {isLoading ? '⏳ Вход...' : '🚀 Войти'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister}>
              <div style={{ marginBottom: '20px' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '6px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#333'
                }}>
                  👤 Имя
                </label>
                <input
                  type="text"
                  value={registerForm.firstName}
                  onChange={(e) => setRegisterForm(prev => ({ ...prev, firstName: e.target.value }))}
                  placeholder="Введите имя"
                  required
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: '2px solid #e9ecef',
                    borderRadius: '8px',
                    fontSize: '16px',
                    transition: 'border-color 0.2s ease',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#007bff'}
                  onBlur={(e) => e.target.style.borderColor = '#e9ecef'}
                  data-testid="input-register-firstname"
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '6px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#333'
                }}>
                  👨‍💼 Фамилия
                </label>
                <input
                  type="text"
                  value={registerForm.lastName}
                  onChange={(e) => setRegisterForm(prev => ({ ...prev, lastName: e.target.value }))}
                  placeholder="Введите фамилию"
                  required
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: '2px solid #e9ecef',
                    borderRadius: '8px',
                    fontSize: '16px',
                    transition: 'border-color 0.2s ease',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#007bff'}
                  onBlur={(e) => e.target.style.borderColor = '#e9ecef'}
                  data-testid="input-register-lastname"
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '6px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#333'
                }}>
                  📧 Email
                </label>
                <input
                  type="email"
                  value={registerForm.email}
                  onChange={(e) => setRegisterForm(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="user@example.com"
                  required
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: '2px solid #e9ecef',
                    borderRadius: '8px',
                    fontSize: '16px',
                    transition: 'border-color 0.2s ease',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#007bff'}
                  onBlur={(e) => e.target.style.borderColor = '#e9ecef'}
                  data-testid="input-register-email"
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '6px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#333'
                }}>
                  📱 Телефон
                </label>
                <input
                  type="tel"
                  value={registerForm.phone}
                  onChange={handleRegisterPhoneChange}
                  placeholder="+7 (___) ___-__-__"
                  required
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: '2px solid #e9ecef',
                    borderRadius: '8px',
                    fontSize: '16px',
                    transition: 'border-color 0.2s ease',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#007bff'}
                  onBlur={(e) => e.target.style.borderColor = '#e9ecef'}
                  data-testid="input-register-phone"
                />
              </div>

              <div style={{ marginBottom: '25px' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '6px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#333'
                }}>
                  🔐 Пароль
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showRegisterPassword ? 'text' : 'password'}
                    value={registerForm.password}
                    onChange={(e) => setRegisterForm(prev => ({ ...prev, password: e.target.value }))}
                    placeholder="Создайте надёжный пароль"
                    required
                    minLength={6}
                    style={{
                      width: '100%',
                      padding: '12px 50px 12px 16px',
                      border: '2px solid #e9ecef',
                      borderRadius: '8px',
                      fontSize: '16px',
                      transition: 'border-color 0.2s ease',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#007bff'}
                    onBlur={(e) => e.target.style.borderColor = '#e9ecef'}
                    data-testid="input-register-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowRegisterPassword(!showRegisterPassword)}
                    style={{
                      position: 'absolute',
                      right: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      fontSize: '16px',
                      cursor: 'pointer',
                      color: '#6c757d'
                    }}
                    data-testid="button-toggle-register-password"
                  >
                    {showRegisterPassword ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: isLoading ? '#6c757d' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '16px',
                  fontWeight: '600',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)'
                }}
                data-testid="button-submit-register"
              >
                {isLoading ? '⏳ Регистрация...' : '🎉 Создать аккаунт'}
              </button>
            </form>
          )}

          {/* Footer */}
          <div style={{
            marginTop: '30px',
            paddingTop: '20px',
            borderTop: '1px solid #e9ecef',
            textAlign: 'center',
            fontSize: '12px',
            color: '#6c757d'
          }}>
            <p style={{ margin: '0 0 5px 0' }}>
              🔒 Ваши данные надёжно защищены
            </p>
            <p style={{ margin: '0' }}>
              Сертифицированная система безопасности
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}