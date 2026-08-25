// Утилиты для работы с российскими номерами телефонов

// Маска для российского номера телефона
export const phoneMask = (value: any) => {
  if (!value) return value;
  const phoneNumber = value.replace(/[^\d]/g, '');
  
  if (phoneNumber.length < 4) return phoneNumber;
  if (phoneNumber.length < 7) return `+7 ${phoneNumber.slice(1, 4)} ${phoneNumber.slice(4)}`;
  if (phoneNumber.length < 11) return `+7 ${phoneNumber.slice(1, 4)} ${phoneNumber.slice(4, 7)}-${phoneNumber.slice(7)}`;
  return `+7 ${phoneNumber.slice(1, 4)} ${phoneNumber.slice(4, 7)}-${phoneNumber.slice(7, 9)}-${phoneNumber.slice(9, 11)}`;
};

// Функция для форматирования российского номера в международный формат
export const formatPhoneToInternational = (phone: any) => {
  if (!phone) return '';
  const digits = phone.replace(/[^\d]/g, '');
  if (digits.startsWith('8')) {
    return '+7' + digits.slice(1);
  }
  if (digits.startsWith('7')) {
    return '+' + digits;
  }
  if (digits.startsWith('9')) {
    return '+7' + digits;
  }
  return phone;
};

// Валидация российского номера телефона
export const validateRussianPhone = (phone: any) => {
  if (!phone) return false;
  
  // Удаляем все символы кроме цифр
  const cleanPhone = phone.replace(/[^\d]/g, '');
  
  // Проверяем что номер начинается с +7 или 7 или 8
  if (phone.startsWith('+7')) {
    const number = cleanPhone.slice(1); // убираем код страны 7
    if (number.length !== 10) return false;
    
    // Проверяем что первая цифра номера корректная для российского мобильного
    const firstDigit = number.charAt(0);
    return ['9', '3', '4', '5', '8'].includes(firstDigit);
  }
  
  return false;
};