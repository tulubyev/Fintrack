/**
 * Document Utilities Module - готов к выделению в библиотеку
 * Утилиты для работы с документами и их статусами
 */

export interface DocumentStatus {
  text: string;
  color: string;
}

/**
 * Получить цвет статуса документа
 * @param status - статус документа
 * @returns цвет в формате HEX
 */
export const getStatusColor = (status: string): string => {
  switch (status) {
    case 'verified': return '#28a745';
    case 'rejected': return '#dc3545';
    case 'processing': return '#ffc107';
    case 'pending': return '#6c757d';
    default: return '#6c757d';
  }
};

/**
 * Получить текст статуса документа
 * @param status - статус документа
 * @returns человекочитаемый текст статуса
 */
export const getStatusText = (status: string): string => {
  switch (status) {
    case 'verified': return 'Верифицирован';
    case 'rejected': return 'Отклонен';
    case 'processing': return 'Обрабатывается';
    case 'pending': return 'Ожидает проверки';
    default: return 'Неизвестно';
  }
};

/**
 * Получить объект статуса документа (для совместимости с ProfileSection)
 * @param status - статус документа
 * @returns объект с текстом и цветом
 */
export const getDocumentStatus = (status: string): DocumentStatus => {
  switch (status) {
    case 'verified': return { text: 'Верифицирован', color: 'green' };
    case 'pending': return { text: 'На проверке', color: 'orange' };
    case 'rejected': return { text: 'Отклонен', color: 'red' };
    case 'processing': return { text: 'Обрабатывается', color: 'orange' };
    default: return { text: 'Не загружен', color: 'gray' };
  }
};

/**
 * Получить иконку документа по MIME типу
 * @param mimeType - MIME тип файла
 * @returns эмодзи иконка
 */
export const getDocumentIconByMimeType = (mimeType: string): string => {
  if (mimeType.startsWith('image/')) {
    return '🖼️';
  } else if (mimeType === 'application/pdf') {
    return '📄';
  } else if (mimeType.includes('word') || mimeType.includes('document')) {
    return '📃';
  } else if (mimeType.includes('sheet') || mimeType.includes('excel')) {
    return '📊';
  } else if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) {
    return '📋';
  } else if (mimeType.includes('text')) {
    return '📝';
  } else if (mimeType.includes('archive') || mimeType.includes('zip') || mimeType.includes('rar')) {
    return '🗃️';
  } else {
    return '📎';
  }
};

/**
 * Получить иконку документа по типу документа
 * @param documentType - тип документа
 * @returns эмодзи иконка
 */
export const getDocumentIconByType = (documentType: string): string => {
  switch (documentType) {
    case 'passport': return '🛂';
    case 'foreign_passport': return '📕';
    case 'driver_license': return '🚗';
    case 'snils': return '🏥';
    case 'inn': return '📊';
    case 'income': return '💰';
    default: return '📄';
  }
};

/**
 * Универсальная функция для получения иконки документа
 * Автоматически определяет тип входного параметра
 * @param typeOrMime - тип документа или MIME тип
 * @returns эмодзи иконка
 */
export const getDocumentIcon = (typeOrMime: string): string => {
  // Если содержит slash, то это MIME тип
  if (typeOrMime.includes('/')) {
    return getDocumentIconByMimeType(typeOrMime);
  }
  // Иначе это тип документа
  return getDocumentIconByType(typeOrMime);
};

/**
 * Проверить является ли файл изображением по MIME типу
 * @param mimeType - MIME тип файла
 * @returns true если это изображение
 */
export const isImageFile = (mimeType: string): boolean => {
  return mimeType.startsWith('image/');
};

/**
 * Получить расширение файла по MIME типу
 * @param mimeType - MIME тип файла
 * @returns расширение файла
 */
export const getFileExtensionByMimeType = (mimeType: string): string => {
  const mimeToExt: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'text/plain': 'txt',
    'text/csv': 'csv'
  };
  
  return mimeToExt[mimeType] || 'file';
};