import { useState, useEffect } from 'react';

interface ImagePreviewProps {
  documentId: string;
  mimeType: string;
  fileName: string;
}

/**
 * Image Preview Component - готов к выделению в библиотеку
 * Компонент для предварительного просмотра изображений документов
 */
export function ImagePreview({ documentId, mimeType, fileName }: ImagePreviewProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showFullImage, setShowFullImage] = useState(false);

  const loadPreview = async () => {
    if (!mimeType.startsWith('image/') || previewUrl) return;
    
    setIsLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/documents/${documentId}/download`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
      }
    } catch (error) {
      console.error('Preview load error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadPreview();
    
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [documentId]);

  if (!mimeType.startsWith('image/')) return null;

  return (
    <div style={{ marginTop: '10px' }}>
      {isLoading ? (
        <div style={{ 
          width: '200px', 
          height: '150px', 
          backgroundColor: '#f8f9fa',
          border: '1px solid #dee2e6',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#6c757d'
        }}>
          Загрузка...
        </div>
      ) : previewUrl ? (
        <>
          <img
            src={previewUrl}
            alt={fileName}
            onClick={() => setShowFullImage(true)}
            style={{
              width: '200px',
              height: '150px',
              objectFit: 'cover',
              border: '1px solid #dee2e6',
              borderRadius: '8px',
              cursor: 'pointer'
            }}
          />
          {showFullImage && (
            <div
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 9999,
                cursor: 'pointer'
              }}
              onClick={() => setShowFullImage(false)}
            >
              <img
                src={previewUrl}
                alt={fileName}
                style={{
                  maxWidth: '90%',
                  maxHeight: '90%',
                  objectFit: 'contain',
                  border: '2px solid white',
                  borderRadius: '8px'
                }}
                onClick={(e) => e.stopPropagation()}
              />
              <button
                onClick={() => setShowFullImage(false)}
                style={{
                  position: 'absolute',
                  top: '20px',
                  right: '20px',
                  backgroundColor: 'rgba(255, 255, 255, 0.8)',
                  border: 'none',
                  borderRadius: '50%',
                  width: '40px',
                  height: '40px',
                  fontSize: '20px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                ✕
              </button>
            </div>
          )}
        </>
      ) : (
        <div style={{ 
          width: '200px', 
          height: '150px', 
          backgroundColor: '#f8f9fa',
          border: '1px solid #dee2e6',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#6c757d'
        }}>
          Не удалось загрузить
        </div>
      )}
    </div>
  );
}