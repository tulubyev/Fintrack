/**
 * Format Utilities Module - готов к выделению в библиотеку
 * Утилиты для форматирования различных данных
 */

/**
 * Форматирование размера файла в человекочитаемый вид
 * @param bytes - размер в байтах
 * @returns отформатированная строка с единицами измерения
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Байт';
  
  const k = 1024;
  const sizes = ['Байт', 'КБ', 'МБ', 'ГБ', 'ТБ'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * Форматирование даты в российском формате
 * @param dateString - строка даты или объект Date
 * @returns отформатированная дата в формате ДД.ММ.ГГГГ
 */
export const formatDate = (dateString: string | Date | null | undefined): string => {
  if (!dateString) return 'Не указано';
  
  const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
  
  // Проверяем валидность даты
  if (!date || isNaN(date.getTime())) {
    return 'Неверная дата';
  }
  
  return date.toLocaleDateString('ru-RU');
};

/**
 * Форматирование даты и времени в российском формате
 * @param dateString - строка даты или объект Date
 * @returns отформатированная дата и время в формате ДД.ММ.ГГГГ, ЧЧ:ММ
 */
export const formatDateTime = (dateString: string | Date | null | undefined): string => {
  if (!dateString) return 'Не указано';
  
  const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
  
  // Проверяем валидность даты
  if (!date || isNaN(date.getTime())) {
    return 'Неверная дата';
  }
  
  return date.toLocaleDateString('ru-RU') + ', ' + 
         date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
};

/**
 * Форматирование времени в российском формате
 * @param dateString - строка даты или объект Date
 * @returns отформатированное время в формате ЧЧ:ММ
 */
export const formatTime = (dateString: string | Date | null | undefined): string => {
  if (!dateString) return 'Не указано';
  
  const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
  
  // Проверяем валидность даты
  if (!date || isNaN(date.getTime())) {
    return 'Неверное время';
  }
  
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
};

/**
 * Форматирование денежной суммы в рублях
 * @param amount - сумма в копейках или рублях
 * @param inKopecks - если true, то сумма в копейках (по умолчанию false)
 * @returns отформатированная сумма с символом рубля
 */
export const formatCurrency = (amount: number, inKopecks: boolean = false): string => {
  const rubles = inKopecks ? amount / 100 : amount;
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: 2
  }).format(rubles);
};

/**
 * Форматирование больших чисел с разделителями
 * @param number - число для форматирования
 * @returns отформатированное число с разделителями
 */
export const formatNumber = (number: number): string => {
  return new Intl.NumberFormat('ru-RU').format(number);
};

/**
 * Форматирование процентов
 * @param value - значение в виде десятичной дроби (0.25) или процентов (25)
 * @param isDecimal - если true, то value - десятичная дробь (по умолчанию true)
 * @returns отформатированный процент
 */
export const formatPercentage = (value: number, isDecimal: boolean = true): string => {
  const percent = isDecimal ? value * 100 : value;
  return `${percent.toFixed(2)}%`;
};

/**
 * Сокращение длинного текста с многоточием
 * @param text - исходный текст
 * @param maxLength - максимальная длина
 * @returns сокращенный текст с многоточием
 */
export const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
};

/**
 * Форматирование номера карты (скрытие средних цифр)
 * @param cardNumber - номер карты
 * @returns отформатированный номер карты (**** **** **** 1234)
 */
export const formatCardNumber = (cardNumber: string): string => {
  const cleaned = cardNumber.replace(/\D/g, '');
  if (cleaned.length !== 16) return cardNumber;
  
  return `**** **** **** ${cleaned.slice(-4)}`;
};

/**
 * Форматирование времени работы (например для статистики)
 * @param seconds - количество секунд
 * @returns отформатированное время (1ч 30м 45с)
 */
export const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  
  const parts = [];
  if (hours > 0) parts.push(`${hours}ч`);
  if (minutes > 0) parts.push(`${minutes}м`);
  if (remainingSeconds > 0 || parts.length === 0) parts.push(`${remainingSeconds}с`);
  
  return parts.join(' ');
};