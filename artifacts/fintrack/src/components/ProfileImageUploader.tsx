import React, { useState, useRef } from 'react';
import { useConfig } from '../hooks/useConfig';

interface ProfileImageUploaderProps {
  currentImageUrl?: string;
  onImageUploaded: (imageUrl: string) => void;
  size?: number;
  className?: string;
}

export function ProfileImageUploader({ 
  currentImageUrl, 
  onImageUploaded, 
  size = 120,
  className = "" 
}: ProfileImageUploaderProps) {
  const { config } = useConfig();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Валидация типа файла
    if (!file.type.startsWith('image/')) {
      setError('Пожалуйста, выберите изображение');
      return;
    }

    // Валидация размера файла из config
    const maxSize = config?.ui.uploads.maxFileSize || 10 * 1024 * 1024;
    const maxSizeMB = config?.ui.uploads.maxFileSizeMB || 10;
    
    if (file.size > maxSize) {
      setError(`Размер файла не должен превышать ${maxSizeMB}MB`);
      return;
    }

    setError(null);
    setIsUploading(true);
    setUploadProgress(0);

    try {
      // Создаем FormData для загрузки
      const formData = new FormData();
      formData.append('profileImage', file);

      // Загружаем файл с прогрессом
      const xhr = new XMLHttpRequest();
      
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const progress = Math.round((event.loaded / event.total) * 100);
          setUploadProgress(progress);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          try {
            const response = JSON.parse(xhr.responseText);
            console.log('Изображение загружено успешно:', response.imageUrl);
            onImageUploaded(response.imageUrl);
            setIsUploading(false);
            setUploadProgress(0);
          } catch (error) {
            console.error('Ошибка обработки ответа сервера:', error);
            setError('Ошибка обработки ответа сервера');
            setIsUploading(false);
          }
        } else {
          console.error('Ошибка загрузки изображения:', xhr.status, xhr.responseText);
          setError(`Ошибка загрузки: ${xhr.status}`);
          setIsUploading(false);
        }
      });

      xhr.addEventListener('error', () => {
        setError('Ошибка сети при загрузке');
        setIsUploading(false);
      });

      // Отправляем запрос
      const endpoint = config?.api.endpoints.profile.uploadImage || '/api/profile/upload-image';
      xhr.open('POST', endpoint);
      
      // Добавляем токен авторизации
      const token = localStorage.getItem('accessToken');
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }
      
      xhr.send(formData);

    } catch (error) {
      setError('Ошибка загрузки изображения');
      setIsUploading(false);
    }
  };

  const getInitials = (firstName: string = '', lastName: string = '') => {
    return (firstName.charAt(0) + lastName.charAt(0)).toUpperCase();
  };

  return (
    <div className={`relative ${className}`} style={{ width: size, height: size }}>
      {/* Изображение профиля или инициалы */}
      <div
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          overflow: 'hidden',
          backgroundColor: currentImageUrl ? 'var(--muted)' : 'var(--primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: isUploading ? 'default' : 'pointer',
          border: '3px solid var(--border)',
          position: 'relative'
        }}
        onClick={() => !isUploading && fileInputRef.current?.click()}
        data-testid="profile-image-container"
      >
        {currentImageUrl ? (
          <img
            src={currentImageUrl}
            alt="Фото профиля"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover'
            }}
            data-testid="profile-image"
          />
        ) : (
          <span
            style={{
              color: 'var(--primary-foreground)',
              fontSize: size * 0.3,
              fontWeight: 'bold'
            }}
            data-testid="profile-initials"
          >
            👤
          </span>
        )}

        {/* Прогресс-бар загрузки */}
        {isUploading && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.6)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%'
            }}
            data-testid="upload-progress-overlay"
          >
            {/* Круговой прогресс-бар */}
            <svg
              width={size * 0.6}
              height={size * 0.6}
              viewBox="0 0 100 100"
              style={{ transform: 'rotate(-90deg)' }}
            >
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="rgba(255, 255, 255, 0.3)"
                strokeWidth="8"
              />
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="var(--success)"
                strokeWidth="8"
                strokeDasharray={`${2 * Math.PI * 45}`}
                strokeDashoffset={`${2 * Math.PI * 45 * (1 - uploadProgress / 100)}`}
                strokeLinecap="round"
                data-testid="progress-circle"
              />
            </svg>
            <div
              style={{
                position: 'absolute',
                color: 'white', // поверх затемнения фото — белый в обеих темах
                fontSize: size * 0.12,
                fontWeight: 'bold'
              }}
              data-testid="progress-text"
            >
              {uploadProgress}%
            </div>
          </div>
        )}

        {/* Иконка камеры для указания на возможность загрузки */}
        {!isUploading && (
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              right: 0,
              width: size * 0.25,
              height: size * 0.25,
              backgroundColor: 'var(--primary)',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '2px solid white',
              cursor: 'pointer'
            }}
            data-testid="camera-icon"
          >
            <span style={{ color: 'var(--primary-foreground)', fontSize: size * 0.12 }}>📷</span>
          </div>
        )}
      </div>

      {/* Скрытый input для выбора файла */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileSelect}
        data-testid="file-input"
      />

      {/* Сообщение об ошибке */}
      {error && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: '8px',
            padding: '8px',
            backgroundColor: 'var(--destructive-subtle)',
            border: '1px solid var(--destructive-subtle)',
            borderRadius: '6px',
            color: 'var(--destructive)',
            fontSize: '14px',
            textAlign: 'center'
          }}
          data-testid="error-message"
        >
          {error}
        </div>
      )}

    </div>
  );
}