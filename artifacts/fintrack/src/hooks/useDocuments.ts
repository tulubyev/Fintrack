import { useState } from 'react';

// Хук для управления документами пользователя
export const useDocuments = () => {
  const [documents, setDocuments] = useState<any[]>([]);
  const [pendingDocuments, setPendingDocuments] = useState<any[]>([]);
  const [documentTypes, setDocumentTypes] = useState<any[]>([]);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);
  
  // Состояния загрузки документов
  const [selectedType, setSelectedType] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Загрузка документов пользователя
  const loadUserDocuments = async () => {
    setIsLoadingDocuments(true);
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/documents/user', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setDocuments(data.documents || []);
        setDocumentTypes(data.documentTypes || []);
      }
    } catch (error) {
      console.error('Ошибка загрузки документов:', error);
    } finally {
      setIsLoadingDocuments(false);
    }
  };

  // Загрузка документов на модерации (для админов)
  const loadPendingDocuments = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/admin/documents/pending', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setPendingDocuments(data);
      }
    } catch (error) {
      console.error('Ошибка загрузки документов на модерации:', error);
    }
  };

  // Загрузка файла документа
  const uploadDocument = async (file: File, documentType: string, description?: string) => {
    setIsUploading(true);
    setUploadProgress(0);
    
    try {
      const formData = new FormData();
      formData.append('document', file);
      formData.append('type', documentType);
      if (description) {
        formData.append('description', description);
      }

      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/documents/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });

      if (response.ok) {
        const result = await response.json();
        await loadUserDocuments(); // Обновляем список документов
        return result;
      }
      
      throw new Error('Ошибка загрузки документа');
    } catch (error) {
      console.error('Ошибка загрузки документа:', error);
      throw error;
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      setSelectedFile(null);
    }
  };

  // Обновление статуса документа (для админов)
  const updateDocumentStatus = async (documentId: string, status: 'verified' | 'rejected', reason?: string) => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/admin/documents/${documentId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status, reason })
      });

      if (response.ok) {
        await loadPendingDocuments(); // Обновляем список документов
        return true;
      }
      return false;
    } catch (error) {
      console.error('Ошибка обновления статуса документа:', error);
      return false;
    }
  };

  // Просмотр документа
  const viewDocument = (documentId: string) => {
    const token = localStorage.getItem('accessToken');
    const url = `/api/documents/${documentId}/view?token=${token}`;
    window.open(url, '_blank');
  };

  // Удаление документа
  const deleteDocument = async (documentId: string) => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/documents/${documentId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        await loadUserDocuments(); // Обновляем список документов
        return true;
      }
      return false;
    } catch (error) {
      console.error('Ошибка удаления документа:', error);
      return false;
    }
  };

  return {
    // Данные
    documents,
    pendingDocuments,
    documentTypes,
    
    // Состояния загрузки
    isLoadingDocuments,
    isUploading,
    uploadProgress,
    
    // Состояния выбора
    selectedType,
    selectedFile,
    setSelectedType,
    setSelectedFile,
    
    // Функции
    loadUserDocuments,
    loadPendingDocuments,
    uploadDocument,
    updateDocumentStatus,
    viewDocument,
    deleteDocument,
    
    // Функции обновления состояния
    setDocuments,
    setPendingDocuments,
    setDocumentTypes,
    setIsLoadingDocuments,
    setIsUploading,
    setUploadProgress,
  };
};