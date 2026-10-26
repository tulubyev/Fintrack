import { useState, useEffect } from 'react';
import { handleDocumentView, handleDocumentDownload, handleDocumentDelete, handleSubmitForReview } from '../services/documentService';
import { getStatusColor, getStatusText, getDocumentIconByMimeType } from '../utils/documentUtils';
import { formatFileSize } from '../utils/formatUtils';
import { ImagePreview } from './ImagePreview';

// Компонент для работы с документами
export function DocumentsSection({ user, documents = [], documentTypes = [], loadUserDocuments }: any) {
  const [selectedType, setSelectedType] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);


  const handleFileUpload = async () => {
    if (!selectedFile || !selectedType) {
      alert('Выберите файл и тип документа');
      return;
    }

    setIsUploading(true);
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
        loadUserDocuments();
      } else {
        throw new Error(result.message || 'Failed to upload document');
      }
    } catch (error: any) {
      console.error('Upload error:', error);
      alert('Ошибка загрузки документа: ' + error.message);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  // Используем утилиты из модулей


  return (
    <div style={{ 
      backgroundColor: 'var(--card)', 
      padding: '20px', 
      borderRadius: '8px', 
      boxShadow: 'var(--shadow-raised)',
      marginBottom: '20px'
    }}>
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        marginBottom: '15px'
      }}>
        <h2 style={{ 
          margin: '0', 
          color: 'var(--foreground)', 
          fontSize: '22px',
          fontWeight: '600'
        }}>
          📄 Документы и верификация
        </h2>
        <div style={{
          marginLeft: '10px',
          padding: '2px 8px',
          backgroundColor: 'var(--primary-subtle)',
          borderRadius: '12px',
          fontSize: '12px',
          color: 'var(--primary)'
        }}>
          {documents.length} документов
        </div>
      </div>

      {/* Форма загрузки документов */}
      <div style={{ 
        border: '2px dashed var(--primary-subtle)', 
        padding: '20px', 
        borderRadius: '8px',
        backgroundColor: 'var(--muted)',
        marginBottom: '20px'
      }}>
        <h3 style={{ margin: '0 0 15px 0', color: 'var(--foreground)' }}>📤 Загрузить документ</h3>
        
        <div style={{ display: 'flex', gap: '15px', marginBottom: '15px', flexWrap: 'wrap' }}>
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            style={{
              padding: '8px 12px',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              backgroundColor: 'var(--card)',
              minWidth: '200px'
            }}
          >
            <option value="">Выберите тип документа</option>
            {documentTypes.map((type: any) => (
              <option key={type.id} value={type.id}>
                {type.displayName}
              </option>
            ))}
          </select>

          <input
            type="file"
            onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
            style={{
              padding: '8px 12px',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              backgroundColor: 'var(--card)'
            }}
          />

          <button
            onClick={handleFileUpload}
            disabled={!selectedFile || !selectedType || isUploading}
            style={{
              padding: '8px 16px',
              backgroundColor: isUploading ? 'var(--muted-foreground)' : 'var(--primary)',
              color: 'var(--primary-foreground)',
              border: 'none',
              borderRadius: '4px',
              cursor: isUploading ? 'not-allowed' : 'pointer',
              opacity: (!selectedFile || !selectedType) ? 0.6 : 1
            }}
          >
            {isUploading ? '⏳ Загрузка...' : '📤 Загрузить'}
          </button>
        </div>

        {uploadProgress > 0 && uploadProgress < 100 && (
          <div style={{ 
            width: '100%', 
            backgroundColor: 'var(--border)', 
            borderRadius: '4px',
            height: '8px'
          }}>
            <div
              style={{
                width: `${uploadProgress}%`,
                height: '100%',
                backgroundColor: 'var(--primary)',
                borderRadius: '4px',
                transition: 'width 0.3s ease'
              }}
            />
          </div>
        )}
      </div>

      {/* Список документов */}
      {documents.length === 0 ? (
        <div style={{ 
          textAlign: 'center', 
          padding: '40px 20px',
          color: 'var(--muted-foreground)',
          backgroundColor: 'var(--muted)',
          borderRadius: '8px',
          border: '1px solid var(--border)'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '10px' }}>📂</div>
          <p style={{ margin: '0', fontSize: '16px' }}>Документы не найдены</p>
          <p style={{ margin: '5px 0 0 0', fontSize: '14px' }}>Загрузите первый документ для верификации</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '15px' }}>
          {documents.map((doc: any) => (
            <div
              key={doc.id}
              style={{
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '15px',
                backgroundColor: 'var(--muted)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '5px' }}>
                    <span style={{ fontSize: '20px', marginRight: '8px' }}>
                      {getDocumentIconByMimeType(doc.mimeType)}
                    </span>
                    <h4 style={{ margin: '0', color: 'var(--foreground)', fontSize: '16px' }}>
                      {doc.fileName}
                    </h4>
                  </div>
                  
                  <div style={{ fontSize: '14px', color: 'var(--muted-foreground)', marginBottom: '5px' }}>
                    Размер: {formatFileSize(doc.fileSize)} | Тип: {doc.documentType}
                  </div>
                  
                  <div style={{ fontSize: '14px', color: 'var(--muted-foreground)', marginBottom: '10px' }}>
                    Загружен: {new Date(doc.uploadedAt).toLocaleString('ru-RU')}
                  </div>
                  
                  <div style={{
                    display: 'inline-block',
                    padding: '4px 8px',
                    borderRadius: '12px',
                    fontSize: '12px',
                    fontWeight: '600',
                    backgroundColor: getStatusColor(doc.status),
                    color: 'var(--primary-foreground)'
                  }}>
                    {getStatusText(doc.status)}
                  </div>

                  {doc.rejectionReason && (
                    <div style={{
                      marginTop: '10px',
                      padding: '8px 12px',
                      backgroundColor: 'var(--destructive-subtle)',
                      border: '1px solid var(--destructive-subtle)',
                      borderRadius: '4px',
                      color: 'var(--destructive)',
                      fontSize: '14px'
                    }}>
                      <strong>Причина отклонения:</strong> {doc.rejectionReason}
                    </div>
                  )}
                </div>
              </div>

              <ImagePreview 
                documentId={doc.id}
                mimeType={doc.mimeType}
                fileName={doc.fileName}
              />

              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '10px' }}>
                <button
                  onClick={() => handleDocumentView(doc.id)}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: 'var(--primary)',
                    color: 'var(--primary-foreground)',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}
                >
                  👁️ Просмотреть
                </button>
                <button
                  onClick={() => handleDocumentDownload(doc.id, doc.fileName)}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: 'var(--success)',
                    color: 'var(--primary-foreground)',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}
                >
                  ⬇️ Скачать
                </button>
                {(doc.status === 'uploaded' || doc.status === 'stored' || doc.status === 'processing') && (
                  <button
                    onClick={() => handleSubmitForReview(doc.id, doc.fileName, loadUserDocuments)}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: 'var(--warning-solid)',
                      color: 'var(--foreground)',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: '500'
                    }}
                  >
                    📋 На проверку
                  </button>
                )}
                {doc.status === 'pending' && (
                  <button
                    disabled
                    style={{
                      padding: '8px 16px',
                      backgroundColor: 'var(--muted-foreground)',
                      color: 'var(--primary-foreground)',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'not-allowed',
                      fontSize: '14px',
                      fontWeight: '500',
                      opacity: 0.6
                    }}
                  >
                    ⏳ На модерации
                  </button>
                )}
                <button
                  onClick={() => handleDocumentDelete(doc.id, doc.fileName, loadUserDocuments)}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: 'var(--destructive)',
                    color: 'var(--primary-foreground)',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}
                >
                  🗑️ Удалить
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}