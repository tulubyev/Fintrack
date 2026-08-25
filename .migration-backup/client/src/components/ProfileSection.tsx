import { useState, useEffect } from 'react';
import { getDocumentIconByType, getDocumentStatus } from '../utils/documentUtils';
import { formatDate } from '../utils/formatUtils';
import { VerificationCard } from './VerificationCard';
import { VerificationModal } from './VerificationModal';
import { ProfileImageUploader } from './ProfileImageUploader';
import { phoneMask, formatPhoneToInternational, validateRussianPhone } from '../utils/phoneUtils';
import { handleDocumentView, handleDocumentDownload, handleDocumentDelete, handleSubmitForReview } from '../services/documentService';

export function ProfileSection({ user, onUserUpdate }: any) {
  const [activeTab, setActiveTab] = useState('profile');
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [documentTypes, setDocumentTypes] = useState([]);
  const [profileData, setProfileData] = useState({
    firstName: user.firstName || '',
    lastName: user.lastName || '',
    email: user.email || '',
    phone: user.phone || ''
  });

  // Состояние для загрузки документов
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedType, setSelectedType] = useState('');
  const [isUploadingDoc, setIsUploadingDoc] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Обновляем profileData при изменении user
  useEffect(() => {
    setProfileData({
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      email: user.email || '',
      phone: user.phone || ''
    });
  }, [user.firstName, user.lastName, user.email, user.phone]);

  // Верификация состояния
  const [verificationStatus, setVerificationStatus] = useState({
    phoneVerified: false,
    emailVerified: false,
    documentsUploaded: false,
    esiaVerified: false,
    bankCardVerified: false
  });

  // Обновляем статус верификации на основе данных пользователя
  useEffect(() => {
    setVerificationStatus({
      phoneVerified: user.isPhoneVerified || false,
      emailVerified: user.isEmailVerified || false,
      documentsUploaded: false,
      esiaVerified: user.isEsiaVerified || false,
      bankCardVerified: false
    });
  }, [user.isPhoneVerified, user.isEmailVerified, user.isEsiaVerified]);

  const [verificationModal, setVerificationModal] = useState({
    isOpen: false,
    type: '',
    data: null
  });

  // Функция загрузки документов пользователя
  const fetchDocuments = async () => {
    try {
      const response = await fetch('/api/documents', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
        }
      });
      if (response.ok) {
        const docs = await response.json();
        setDocuments(docs);
      }
    } catch (error: any) {
      console.error('Ошибка загрузки документов:', error);
    }
  };

  // Загрузка документов при монтировании
  useEffect(() => {

    const fetchDocumentTypes = async () => {
      try {
        const response = await fetch('/api/documents/types', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
          }
        });
        if (response.ok) {
          const types = await response.json();
          setDocumentTypes(types);
        }
      } catch (error: any) {
        console.error('Ошибка загрузки типов документов:', error);
      }
    };

    if (activeTab === 'documents') {
      fetchDocuments();
      fetchDocumentTypes();
    }
  }, [activeTab]);

  const handleSaveProfile = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
        },
        body: JSON.stringify({
          firstName: profileData.firstName,
          lastName: profileData.lastName,
          email: profileData.email,
          phone: formatPhoneToInternational(profileData.phone)
        })
      });

      if (response.ok) {
        const updatedUser = await response.json();
        onUserUpdate(updatedUser);
        setIsEditing(false);
        alert('Профиль успешно обновлен');
      } else {
        throw new Error('Failed to update profile');
      }
    } catch (error: any) {
      console.error('Error updating profile:', error);
      alert('Ошибка обновления профиля: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerificationAction = (type: string, data?: any) => {
    setVerificationModal({
      isOpen: true,
      type,
      data: data || null
    });
  };

  const closeVerificationModal = () => {
    setVerificationModal({
      isOpen: false,
      type: '',
      data: null
    });
  };

  const handlePhoneChange = (e: any) => {
    const maskedPhone = phoneMask(e.target.value);
    setProfileData(prev => ({ ...prev, phone: maskedPhone }));
  };

  // Функция загрузки документа
  const handleFileUpload = async () => {
    if (!selectedFile || !selectedType) {
      alert('Выберите файл и тип документа');
      return;
    }

    setIsUploadingDoc(true);
    setUploadProgress(0);

    try {
      // Создаем FormData для загрузки документа
      const formData = new FormData();
      formData.append('document', selectedFile);
      formData.append('documentTypeId', selectedType);

      // Загружаем документ напрямую в локальное зашифрованное хранилище
      const uploadResponse = await fetch('/api/documents/upload', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
        },
        body: formData
      });

      const result = await uploadResponse.json();

      if (uploadResponse.ok) {
        alert(result.message || 'Документ успешно загружен и зашифрован!');
        setSelectedFile(null);
        setSelectedType('');
        fetchDocuments();
      } else {
        throw new Error(result.message || 'Failed to upload document');
      }
    } catch (error: any) {
      console.error('Upload error:', error);
      alert('Ошибка загрузки документа: ' + error.message);
    } finally {
      setIsUploadingDoc(false);
      setUploadProgress(0);
    }
  };

  // Используем утилиты из модулей

  return (
    <>
      <div style={{ 
        backgroundColor: 'white', 
        borderRadius: '8px', 
        boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)',
        marginBottom: '20px'
      }}>
        {/* Header */}
        <div style={{
          padding: '20px',
          borderBottom: '1px solid #e9ecef',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h1 style={{ margin: '0', color: '#333', fontSize: '24px', fontWeight: '600' }}>
            👤 Профиль пользователя
          </h1>
          <div style={{
            padding: '4px 12px',
            backgroundColor: '#e8f5e8',
            color: '#2e7d2e',
            borderRadius: '12px',
            fontSize: '12px',
            fontWeight: '600'
          }}>
            {user.role || 'Personal'}
          </div>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid #e9ecef',
          overflowX: 'auto'
        }}>
          {[
            { id: 'profile', label: '📝 Профиль' },
            { id: 'verification', label: '✅ Верификация' },
            { id: 'documents', label: '📄 Документы' },
            { id: 'security', label: '🔒 Безопасность' },
            { id: 'notifications', label: '🔔 Уведомления' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '12px 20px',
                border: 'none',
                backgroundColor: activeTab === tab.id ? '#007bff' : 'transparent',
                color: activeTab === tab.id ? 'white' : '#666',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500',
                whiteSpace: 'nowrap'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ padding: '20px' }}>
          {/* Profile Tab */}
          {activeTab === 'profile' && (
            <div>
              <div style={{ display: 'flex', gap: '30px', marginBottom: '30px' }}>
                {/* Profile Photo */}
                <div style={{ textAlign: 'center' }}>
                  <ProfileImageUploader 
                    currentImageUrl={user?.profileImageUrl}
                    onImageUploaded={(imageUrl) => {
                      onUserUpdate({ ...user, profileImageUrl: imageUrl });
                    }}
                  />
                </div>

                {/* Profile Info */}
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500', color: '#333' }}>
                        Имя
                      </label>
                      {isEditing ? (
                        <input
                          type="text"
                          value={profileData.firstName}
                          onChange={(e) => setProfileData(prev => ({ ...prev, firstName: e.target.value }))}
                          style={{
                            width: '100%',
                            padding: '10px',
                            border: '1px solid #ddd',
                            borderRadius: '4px',
                            fontSize: '14px'
                          }}
                        />
                      ) : (
                        <div style={{ 
                          padding: '10px 0',
                          fontSize: '16px',
                          color: '#333',
                          borderBottom: '1px solid #f0f0f0'
                        }}>
                          {user.firstName || 'Не указано'}
                        </div>
                      )}
                    </div>

                    <div>
                      <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500', color: '#333' }}>
                        Фамилия
                      </label>
                      {isEditing ? (
                        <input
                          type="text"
                          value={profileData.lastName}
                          onChange={(e) => setProfileData(prev => ({ ...prev, lastName: e.target.value }))}
                          style={{
                            width: '100%',
                            padding: '10px',
                            border: '1px solid #ddd',
                            borderRadius: '4px',
                            fontSize: '14px'
                          }}
                        />
                      ) : (
                        <div style={{ 
                          padding: '10px 0',
                          fontSize: '16px',
                          color: '#333',
                          borderBottom: '1px solid #f0f0f0'
                        }}>
                          {user.lastName || 'Не указано'}
                        </div>
                      )}
                    </div>

                    <div>
                      <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500', color: '#333' }}>
                        Email
                      </label>
                      {isEditing ? (
                        <input
                          type="email"
                          value={profileData.email}
                          onChange={(e) => setProfileData(prev => ({ ...prev, email: e.target.value }))}
                          style={{
                            width: '100%',
                            padding: '10px',
                            border: '1px solid #ddd',
                            borderRadius: '4px',
                            fontSize: '14px'
                          }}
                        />
                      ) : (
                        <div style={{ 
                          padding: '10px 0',
                          fontSize: '16px',
                          color: '#333',
                          borderBottom: '1px solid #f0f0f0'
                        }}>
                          {user.email || 'Не указано'}
                          {user.isEmailVerified && (
                            <span style={{ marginLeft: '10px', color: 'green' }}>✓</span>
                          )}
                        </div>
                      )}
                    </div>

                    <div>
                      <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500', color: '#333' }}>
                        Телефон
                      </label>
                      {isEditing ? (
                        <input
                          type="tel"
                          value={profileData.phone}
                          onChange={handlePhoneChange}
                          placeholder="+7 (___) ___-__-__"
                          style={{
                            width: '100%',
                            padding: '10px',
                            border: '1px solid #ddd',
                            borderRadius: '4px',
                            fontSize: '14px'
                          }}
                        />
                      ) : (
                        <div style={{ 
                          padding: '10px 0',
                          fontSize: '16px',
                          color: '#333',
                          borderBottom: '1px solid #f0f0f0'
                        }}>
                          {user.phone || 'Не указано'}
                          {user.isPhoneVerified && (
                            <span style={{ marginLeft: '10px', color: 'green' }}>✓</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
                    {isEditing ? (
                      <>
                        <button
                          onClick={handleSaveProfile}
                          disabled={isLoading}
                          style={{
                            padding: '10px 20px',
                            backgroundColor: isLoading ? '#6c757d' : '#28a745',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: isLoading ? 'not-allowed' : 'pointer',
                            fontSize: '14px',
                            fontWeight: '500'
                          }}
                        >
                          {isLoading ? 'Сохранение...' : 'Сохранить'}
                        </button>
                        <button
                          onClick={() => setIsEditing(false)}
                          disabled={isLoading}
                          style={{
                            padding: '10px 20px',
                            backgroundColor: '#6c757d',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '14px',
                            fontWeight: '500'
                          }}
                        >
                          Отмена
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setIsEditing(true)}
                        style={{
                          padding: '10px 20px',
                          backgroundColor: '#007bff',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '14px',
                          fontWeight: '500'
                        }}
                      >
                        Редактировать
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Verification Tab */}
          {activeTab === 'verification' && (
            <div>
              <h2 style={{ marginBottom: '20px', color: '#333' }}>Верификация аккаунта</h2>
              
              <VerificationCard 
                user={user}
                verificationStatus={verificationStatus}
                onNavigateToDocuments={() => setActiveTab('documents')}
                onVerificationUpdate={(status) => setVerificationStatus(prev => ({ ...prev, ...status }))}
              />
            </div>
          )}

          {/* Documents Tab */}
          {activeTab === 'documents' && (
            <div>
              <h2 style={{ marginBottom: '20px', color: '#333' }}>Мои документы</h2>

              {/* Форма загрузки документов */}
              <div style={{ 
                border: '2px dashed #d1ecf1', 
                padding: '20px', 
                borderRadius: '8px',
                backgroundColor: '#f8f9fa',
                marginBottom: '20px'
              }}>
                <h3 style={{ margin: '0 0 15px 0', color: '#495057' }}>📤 Загрузить документ</h3>
                
                <div style={{ display: 'flex', gap: '15px', marginBottom: '15px', flexWrap: 'wrap' }}>
                  <select 
                    value={selectedType} 
                    onChange={(e) => setSelectedType(e.target.value)}
                    style={{
                      padding: '8px 12px',
                      border: '1px solid #ccc',
                      borderRadius: '4px',
                      minWidth: '200px'
                    }}
                  >
                    <option value="">Выберите тип документа</option>
                    {documentTypes.map((type: any) => (
                      <option key={type.id} value={type.id}>{type.displayName}</option>
                    ))}
                  </select>

                  <input 
                    type="file" 
                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    style={{
                      padding: '8px',
                      border: '1px solid #ccc',
                      borderRadius: '4px'
                    }}
                  />

                  <button
                    onClick={handleFileUpload}
                    disabled={!selectedFile || !selectedType || isUploadingDoc}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: isUploadingDoc ? '#6c757d' : '#007bff',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: isUploadingDoc ? 'not-allowed' : 'pointer',
                      opacity: (!selectedFile || !selectedType) ? 0.6 : 1
                    }}
                  >
                    {isUploadingDoc ? '⏳ Загрузка...' : '📤 Загрузить'}
                  </button>
                </div>

                {uploadProgress > 0 && uploadProgress < 100 && (
                  <div style={{ 
                    width: '100%', 
                    backgroundColor: '#e9ecef', 
                    borderRadius: '4px',
                    height: '8px'
                  }}>
                    <div
                      style={{
                        width: `${uploadProgress}%`,
                        height: '100%',
                        backgroundColor: '#007bff',
                        borderRadius: '4px',
                        transition: 'width 0.3s ease'
                      }}
                    />
                  </div>
                )}
              </div>

              {documents.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#666' }}>
                  <div style={{ fontSize: '48px', marginBottom: '15px' }}>📄</div>
                  <p style={{ margin: '0', fontSize: '16px' }}>У вас нет загруженных документов</p>
                  <p style={{ margin: '10px 0 0 0', fontSize: '14px' }}>
                    Используйте форму выше для загрузки документов
                  </p>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '12px' }}>
                  {documents.map((doc: any) => {
                    const status = getDocumentStatus(doc.status);
                    return (
                      <div
                        key={doc.id}
                        style={{
                          border: '1px solid #e9ecef',
                          borderRadius: '8px',
                          padding: '15px',
                          backgroundColor: '#fdfdfd',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flex: 1 }}>
                          <span style={{ fontSize: '24px' }}>
                            {getDocumentIconByType(doc.documentTypeId)}
                          </span>
                          <div>
                            <h4 style={{ margin: '0', color: '#333', fontSize: '16px' }}>
                              {doc.typeName || doc.documentTypeId}
                            </h4>
                            <p style={{ margin: '2px 0', fontSize: '14px', color: '#666' }}>
                              Загружен: {formatDate(doc.createdAt)}
                            </p>
                            <p style={{ 
                              margin: '0', 
                              fontSize: '12px', 
                              color: status.color,
                              fontWeight: '500'
                            }}>
                              {status.text}
                              {doc.verificationNotes && ` - ${doc.verificationNotes}`}
                            </p>
                          </div>
                        </div>
                        
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            onClick={() => handleDocumentView(doc.id)}
                            style={{
                              padding: '6px 12px',
                              backgroundColor: '#007bff',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '12px'
                            }}
                          >
                            👁️ Просмотр
                          </button>
                          <button
                            onClick={() => handleDocumentDownload(doc.id, doc.fileName || 'document')}
                            style={{
                              padding: '6px 12px',
                              backgroundColor: '#28a745',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '12px'
                            }}
                          >
                            💾 Скачать
                          </button>
                          {(doc.status === 'uploaded' || doc.status === 'stored' || doc.status === 'processing' || doc.status === 'pending') && (
                            <button
                              onClick={() => handleSubmitForReview(doc.id, doc.fileName || 'document', fetchDocuments)}
                              style={{
                                padding: '6px 12px',
                                backgroundColor: '#ffc107',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '12px'
                              }}
                            >
                              📤 На модерацию
                            </button>
                          )}
                          <button
                            onClick={() => handleDocumentDelete(doc.id, doc.fileName || 'document', fetchDocuments)}
                            style={{
                              padding: '6px 12px',
                              backgroundColor: '#dc3545',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '12px'
                            }}
                          >
                            🗑️ Удалить
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Security Tab */}
          {activeTab === 'security' && (
            <div>
              <h2 style={{ marginBottom: '20px', color: '#333' }}>Настройки безопасности</h2>
              <div style={{ textAlign: 'center', color: '#666', padding: '40px' }}>
                <div style={{ fontSize: '48px', marginBottom: '10px' }}>🔒</div>
                <p>Настройки безопасности будут добавлены в следующих версиях</p>
              </div>
            </div>
          )}

          {/* Notifications Tab */}
          {activeTab === 'notifications' && (
            <div>
              <h2 style={{ marginBottom: '20px', color: '#333' }}>Настройки уведомлений</h2>
              <div style={{ textAlign: 'center', color: '#666', padding: '40px' }}>
                <div style={{ fontSize: '48px', marginBottom: '10px' }}>🔔</div>
                <p>Настройки уведомлений будут добавлены в следующих версиях</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Verification Modal */}
      <VerificationModal
        isOpen={verificationModal.isOpen}
        type={verificationModal.type as 'email' | 'sms'}
        target={verificationModal.type === 'email' ? (user.email || '') : (user.phone || '')}
        onClose={closeVerificationModal}
        onSuccess={(verified: boolean) => {
          console.log('Verification completed:', verified);
          closeVerificationModal();
          // Update verification status based on result
          if (verified) {
            if (verificationModal.type === 'email') {
              setVerificationStatus(prev => ({ ...prev, emailVerified: true }));
            } else {
              setVerificationStatus(prev => ({ ...prev, phoneVerified: true }));
            }
          }
        }}
      />
    </>
  );
}