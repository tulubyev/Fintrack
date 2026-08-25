import React, { useState, useEffect } from 'react';
import { useConfig } from '../hooks/useConfig';

interface VerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'sms' | 'email';
  target: string; // phone number or email
  onSuccess?: (verified: boolean) => void;
}

export function VerificationModal({ 
  isOpen, 
  onClose, 
  type, 
  target, 
  onSuccess 
}: VerificationModalProps) {
  const { config } = useConfig();
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [timeLeft, setTimeLeft] = useState(0);
  const [canResend, setCanResend] = useState(false);
  const [error, setError] = useState('');

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setCode('');
      setMessage('');
      setTimeLeft(0);
      setCanResend(true);
      sendCode();
    }
  }, [isOpen]);

  // Countdown timer for resend
  useEffect(() => {
    if (timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
      return () => clearTimeout(timer);
    } else if (timeLeft === 0 && !canResend) {
      setCanResend(true);
    }
  }, [timeLeft, canResend]);

  const sendCode = async () => {
    setIsLoading(true);
    setError('');
    try {
      if (!config) {
        setError('Конфигурация не загружена');
        return;
      }
      
      const token = localStorage.getItem('accessToken');
      const endpoints = config.api.endpoints.verification;
      const endpoint = type === 'sms' ? endpoints.sendSms : endpoints.sendEmail;
      const body = type === 'sms' ? { phone: target } : { email: target };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setMessage(data.message || 'Код отправлен');
        const timeout = type === 'sms' ? config.ui.verification.smsTimeout : config.ui.verification.emailTimeout;
        setTimeLeft(timeout);
        setCanResend(false);
      } else {
        setMessage(data.message || 'Ошибка отправки кода');
      }
    } catch (error) {
      setError('Ошибка отправки кода');
      setMessage('Ошибка отправки кода');
    } finally {
      setIsLoading(false);
    }
  };

  const verifyCode = async () => {
    if (!code || code.length !== 6) {
      setMessage('Введите 6-значный код');
      return;
    }

    setIsLoading(true);
    setError('');
    try {
      if (!config) {
        setError('Конфигурация не загружена');
        return;
      }
      
      const token = localStorage.getItem('accessToken');
      const endpoints = config.api.endpoints.verification;
      const endpoint = type === 'sms' ? endpoints.verifySms : endpoints.verifyEmail;
      const body = type === 'sms' ? { phone: target, code } : { email: target, code };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setMessage(data.message || 'Верификация успешна!');
        setTimeout(() => {
          onSuccess?.(true);
          onClose();
        }, 1500);
      } else {
        setMessage(data.message || 'Неверный код');
      }
    } catch (error) {
      setMessage('Ошибка проверки кода');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').substring(0, 6);
    setCode(value);
  };

  if (!isOpen) return null;

  const typeText = type === 'sms' ? 'SMS' : 'Email';
  const maskedTarget = type === 'sms' 
    ? target.replace(/(\+\d{1,3})\d+(\d{2})/, '$1***$2')
    : target.replace(/(.{2}).*(@.*)/, '$1***$2');

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Подтверждение {typeText}</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl"
          >
            ×
          </button>
        </div>

        <div className="mb-4">
          <p className="text-sm text-gray-600 mb-2">
            Код отправлен на {maskedTarget}
          </p>
          <p className="text-xs text-gray-500">
            Введите 6-значный код из {typeText === 'SMS' ? 'сообщения' : 'письма'}
          </p>
        </div>

        <div className="mb-4">
          <input
            type="text"
            value={code}
            onChange={handleCodeChange}
            placeholder="000000"
            className="w-full px-4 py-3 text-center text-2xl font-mono border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            maxLength={6}
            disabled={isLoading}
          />
        </div>

        {message && (
          <div className={`mb-4 p-3 rounded-lg text-sm ${
            message.includes('успешно') || message.includes('отправлен')
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {message}
          </div>
        )}

        <div className="flex flex-col gap-3">
          <button
            onClick={verifyCode}
            disabled={isLoading || !code || code.length !== 6}
            className="w-full py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? 'Проверка...' : 'Подтвердить код'}
          </button>

          <button
            onClick={sendCode}
            disabled={!canResend || isLoading}
            className="w-full py-2 text-blue-600 font-medium hover:text-blue-700 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {!canResend 
              ? `Отправить повторно через ${timeLeft}с`
              : isLoading
                ? 'Отправка...'
                : 'Отправить код повторно'
            }
          </button>
        </div>
      </div>
    </div>
  );
}