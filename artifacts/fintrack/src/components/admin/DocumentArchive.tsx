interface DocumentArchiveProps {
  isVisible: boolean;
  documents: any[];
  isLoading: boolean;
}

export function DocumentArchive({ isVisible, documents, isLoading }: DocumentArchiveProps) {
  if (!isVisible) return null;

  return (
    <div style={{ backgroundColor: 'var(--card)', padding: '25px', borderRadius: '12px', border: '1px solid var(--border)', marginBottom: '20px' }}>
      <h2 style={{ margin: '0 0 15px 0', color: 'var(--foreground)' }}>🗃️ Архив документов</h2>
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '20px' }}>
          <div>Загрузка архива...</div>
        </div>
      ) : (
        <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
          {documents.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px', color: 'var(--muted-foreground)' }}>
              Архивных документов пока нет
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '10px' }}>
              {documents.map((doc: any) => (
                <div key={doc.id} style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  padding: '15px',
                  backgroundColor: 'var(--muted)',
                  borderRadius: '8px',
                  border: '1px solid var(--border)'
                }}>
                  <div>
                    <div style={{ fontWeight: 'bold', color: 'var(--foreground)', marginBottom: '5px' }}>
                      {doc.originalName}
                    </div>
                    <div style={{ fontSize: '14px', color: 'var(--muted-foreground)', marginBottom: '5px' }}>
                      👤 {doc.userFirstName} {doc.userLastName} • 📞 {doc.userPhone}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--muted-foreground)' }}>
                      Статус: <span style={{ 
                        backgroundColor: doc.status === 'verified' ? 'var(--success)' : 'var(--destructive)',
                        color: 'var(--primary-foreground)',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '11px'
                      }}>
                        {doc.status === 'verified' ? '✅ Утвержден' : '❌ Отклонен'}
                      </span> • Обработан: {doc.verifiedAt ? new Date(doc.verifiedAt).toLocaleString('ru-RU') : 'Дата не указана'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button 
                      style={{
                        padding: '6px 12px',
                        backgroundColor: 'var(--primary)',
                        color: 'var(--primary-foreground)',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '12px'
                      }}
                      onClick={async () => {
                        try {
                          // SECURITY FIX: Get one-time view token
                          const token = localStorage.getItem('accessToken');
                          const response = await fetch(`/api/documents/${doc.id}/view-token`, {
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${token}` }
                          });
                          
                          if (!response.ok) {
                            alert('Ошибка получения токена просмотра');
                            return;
                          }
                          
                          const { viewToken } = await response.json();
                          window.open(`/api/documents/${doc.id}/view?viewToken=${viewToken}`, '_blank');
                        } catch (error) {
                          console.error('Error:', error);
                          alert('Ошибка при открытии документа');
                        }
                      }}
                    >
                      👁️ Просмотр
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}