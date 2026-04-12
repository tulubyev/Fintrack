interface PendingDocument {
  id: string;
  originalName: string;
  userFirstName: string;
  userLastName: string;
  userPhone: string;
  uploadedAt: string;
}

interface PendingDocumentsListProps {
  documents: PendingDocument[];
  isLoading: boolean;
  onUpdateStatus: (docId: string, status: string, reason?: string) => Promise<boolean>;
}

export function PendingDocumentsList({ documents, isLoading, onUpdateStatus }: PendingDocumentsListProps) {
  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '20px' }}>
        <div>Загрузка документов...</div>
      </div>
    );
  }

  if (documents.length === 0) {
    return null;
  }

  return (
    <div style={{ backgroundColor: 'white', padding: '25px', borderRadius: '12px', border: '1px solid #e9ecef', marginBottom: '20px' }}>
      <h2 style={{ margin: '0 0 15px 0', color: '#333' }}>📄 Документы на модерацию</h2>
      <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
        {documents.map((doc) => (
          <div key={doc.id} style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            padding: '15px',
            marginBottom: '10px',
            backgroundColor: '#f8f9fa',
            borderRadius: '8px',
            border: '1px solid #e9ecef'
          }}>
            <div>
              <div style={{ fontWeight: 'bold', color: '#333', marginBottom: '5px' }}>
                {doc.originalName}
              </div>
              <div style={{ fontSize: '14px', color: '#666', marginBottom: '5px' }}>
                👤 {doc.userFirstName} {doc.userLastName} • 📞 {doc.userPhone}
              </div>
              <div style={{ fontSize: '12px', color: '#999' }}>
                Загружен: {doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleString('ru-RU') : 'Дата не указана'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#007bff',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px'
                }}
                onClick={async () => {
                  try {
                    // SECURITY FIX: Get one-time view token instead of using accessToken in URL
                    const token = localStorage.getItem('accessToken');
                    const response = await fetch(`/api/documents/${doc.id}/view-token`, {
                      method: 'POST',
                      headers: {
                        'Authorization': `Bearer ${token}`
                      }
                    });
                    
                    if (!response.ok) {
                      alert('Ошибка получения токена просмотра');
                      return;
                    }
                    
                    const { viewToken } = await response.json();
                    window.open(`/api/documents/${doc.id}/view?viewToken=${viewToken}`, '_blank');
                  } catch (error) {
                    console.error('Error viewing document:', error);
                    alert('Ошибка при открытии документа');
                  }
                }}
              >
                👁️ Просмотреть
              </button>
              <button 
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px'
                }}
                onClick={async () => {
                  const success = await onUpdateStatus(doc.id, 'verified', 'Документ проверен и утвержден администратором');
                  if (success) {
                    alert(`✅ Документ "${doc.originalName}" успешно утвержден!\nСтатус верификации пользователя ${doc.userFirstName} ${doc.userLastName} будет автоматически обновлен.`);
                  } else {
                    alert('❌ Ошибка при утверждении документа');
                  }
                }}
              >
                ✅ Утвердить
              </button>
              <button 
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px'
                }}
                onClick={async () => {
                  const reason = window.confirm('Отклонить документ? Нажмите OK для подтверждения.') 
                    ? 'Документ не соответствует требованиям верификации' 
                    : null;
                  if (reason) {
                    const success = await onUpdateStatus(doc.id, 'rejected', reason);
                    if (success) {
                      alert(`❌ Документ "${doc.originalName}" отклонен.\nПричина: ${reason}`);
                    } else {
                      alert('❌ Ошибка при отклонении документа');
                    }
                  }
                }}
              >
                ❌ Отклонить
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
