// Сервис для работы с документами

// Просмотр документа в браузере
export const handleDocumentView = async (documentId: string) => {
  try {
    const token = localStorage.getItem('accessToken');
    const url = `/api/documents/${documentId}/view`;
    
    // Открываем документ в новой вкладке
    window.open(url + `?token=${token}`, '_blank');
  } catch (error) {
    console.error('View error:', error);
    alert('Ошибка просмотра документа');
  }
};

// Скачивание документа
export const handleDocumentDownload = async (documentId: string, fileName: string) => {
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
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } else {
      const error = await response.json();
      alert('Ошибка скачивания: ' + (error.message || 'Неизвестная ошибка'));
    }
  } catch (error) {
    console.error('Download error:', error);
    alert('Ошибка скачивания документа');
  }
};

// Удаление документа
export const handleDocumentDelete = async (documentId: string, fileName: string, loadUserDocuments: () => void) => {
  if (!confirm(`Вы уверены, что хотите удалить документ "${fileName}"? Это действие нельзя отменить.`)) {
    return;
  }

  try {
    const token = localStorage.getItem('accessToken');
    const response = await fetch(`/api/documents/${documentId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (response.ok) {
      alert('Документ успешно удален');
      loadUserDocuments(); // Обновляем список документов
    } else {
      const error = await response.json();
      alert('Ошибка удаления: ' + (error.message || 'Неизвестная ошибка'));
    }
  } catch (error) {
    console.error('Delete error:', error);
    alert('Ошибка удаления документа');
  }
};

// Отправка документа на проверку
export const handleSubmitForReview = async (documentId: string, fileName: string, loadUserDocuments: () => void) => {
  if (!confirm(`Отправить документ "${fileName}" на проверку администратору?`)) {
    return;
  }

  try {
    const token = localStorage.getItem('accessToken');
    const response = await fetch(`/api/documents/${documentId}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        status: 'pending',
        changeReason: 'Отправлено на проверку пользователем'
      })
    });

    if (response.ok) {
      alert('Документ отправлен на проверку администратору');
      loadUserDocuments(); // Обновляем список документов
    } else {
      const error = await response.json();
      alert('Ошибка отправки: ' + (error.message || 'Неизвестная ошибка'));
    }
  } catch (error) {
    console.error('Submit error:', error);
    alert('Ошибка отправки документа на проверку');
  }
};