import React, { useState, useEffect } from 'react';
import { VerificationModal } from './VerificationModal';

interface VerificationLevel {
  level: number;
  name: string;
  limit: string;
  requirements: string[];
  color: string;
  bgColor: string;
}

const VERIFICATION_LEVELS: VerificationLevel[] = [
  {
    level: 1,
    name: 'Базовая',
    limit: '15 000 ₽/мес',
    requirements: ['Подтверждение телефона'],
    color: 'text-yellow-700',
    bgColor: 'bg-yellow-50 border-yellow-200'
  },
  {
    level: 2,
    name: 'Стандартная',
    limit: '100 000 ₽/мес',
    requirements: ['Подтверждение телефона', 'Подтверждение email', 'Загрузка документов'],
    color: 'text-blue-700',
    bgColor: 'bg-blue-50 border-blue-200'
  },
  {
    level: 3,
    name: 'Полная',
    limit: '600 000 ₽/мес',
    requirements: ['Подтверждение телефона', 'Подтверждение email', 'Верификация через Госуслуги', 'Подтверждение банковской карты'],
    color: 'text-green-700',
    bgColor: 'bg-green-50 border-green-200'
  }
];

interface VerificationStatus {
  phoneVerified: boolean;
  emailVerified: boolean;
  documentsUploaded: boolean;
  esiaVerified: boolean;
  bankCardVerified: boolean;
}

interface VerificationCardProps {
  onNavigateToDocuments?: () => void;
  user?: {
    phone?: string;
    email?: string;
    isPhoneVerified?: boolean;
    isEmailVerified?: boolean;
    verificationLevel2?: boolean;
    verificationLevel3?: boolean;
  };
  verificationStatus?: VerificationStatus;
  onVerificationUpdate?: (status: VerificationStatus) => void;
}

export function VerificationCard({ 
  onNavigateToDocuments, 
  user = {},
  verificationStatus: externalStatus,
  onVerificationUpdate 
}: VerificationCardProps) {
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>({
    phoneVerified: user.isPhoneVerified || externalStatus?.phoneVerified || false,
    emailVerified: user.isEmailVerified || externalStatus?.emailVerified || false,
    documentsUploaded: externalStatus?.documentsUploaded || false,
    esiaVerified: externalStatus?.esiaVerified || false,
    bankCardVerified: externalStatus?.bankCardVerified || false
  });

  const [verificationModal, setVerificationModal] = useState<{
    isOpen: boolean;
    type: 'sms' | 'email';
    target: string;
  }>({
    isOpen: false,
    type: 'sms',
    target: ''
  });

  // Синхронизация с внешним статусом
  useEffect(() => {
    if (externalStatus) {
      setVerificationStatus({
        phoneVerified: user.isPhoneVerified || externalStatus.phoneVerified,
        emailVerified: user.isEmailVerified || externalStatus.emailVerified,
        documentsUploaded: externalStatus.documentsUploaded,
        esiaVerified: externalStatus.esiaVerified,
        bankCardVerified: externalStatus.bankCardVerified
      });
    }
  }, [externalStatus, user.isPhoneVerified, user.isEmailVerified]);

  // Calculate current verification level
  const getCurrentLevel = (): number => {
    // Проверяем по полям из базы данных (с двумя вариантами названий)
    if (user.verificationLevel3) {
      return 3;
    }
    if (user.verificationLevel2) {
      return 2;
    }
    if (verificationStatus.phoneVerified && verificationStatus.emailVerified) {
      return 1;
    }
    return 0;
  };

  const currentLevel = getCurrentLevel();
  const currentLevelInfo = VERIFICATION_LEVELS[currentLevel] || {
    level: 0,
    name: 'Не верифицирован',
    limit: '0 ₽/мес',
    requirements: [],
    color: 'text-gray-700',
    bgColor: 'bg-gray-50 border-gray-200'
  };

  const handleVerifyPhone = () => {
    setVerificationModal({
      isOpen: true,
      type: 'sms',
      target: user.phone || ''
    });
  };

  const handleVerifyEmail = () => {
    setVerificationModal({
      isOpen: true,
      type: 'email', 
      target: user.email || ''
    });
  };

  const handleVerificationSuccess = (verified: boolean, type: 'sms' | 'email') => {
    if (verified) {
      const newStatus = { ...verificationStatus };
      if (type === 'sms') {
        newStatus.phoneVerified = true;
      } else {
        newStatus.emailVerified = true;
      }
      setVerificationStatus(newStatus);
      onVerificationUpdate?.(newStatus);
    }
  };

  const closeModal = () => {
    setVerificationModal(prev => ({ ...prev, isOpen: false }));
  };

  // Получить статус уровня (доступен, текущий, заблокирован)
  const getLevelStatus = (level: number): 'completed' | 'current' | 'locked' => {
    if (level <= currentLevel) return 'completed';
    if (level === currentLevel + 1) return 'current';
    return 'locked';
  };

  // Проверить завершенность требований для уровня
  const getRequirementStatus = (requirement: string): boolean => {
    switch (requirement) {
      case 'Подтверждение телефона':
        return verificationStatus.phoneVerified;
      case 'Подтверждение email':
        return verificationStatus.emailVerified;
      case 'Загрузка документов':
        return verificationStatus.documentsUploaded;
      case 'Верификация через Госуслуги':
        return verificationStatus.esiaVerified;
      case 'Подтверждение банковской карты':
        return verificationStatus.bankCardVerified;
      default:
        return false;
    }
  };

  return (
    <>
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900">Система верификации</h2>
          <div className={`px-3 py-1 rounded-full border ${currentLevelInfo.bgColor} ${currentLevelInfo.color}`}>
            Текущий: {currentLevelInfo.name}
          </div>
        </div>

        {/* Блоки уровней верификации */}
        <div className="space-y-6">
          {VERIFICATION_LEVELS.map((level) => {
            const status = getLevelStatus(level.level);
            const isCompleted = status === 'completed';
            const isCurrent = status === 'current';
            const isLocked = status === 'locked';

            return (
              <div
                key={level.level}
                className={`relative p-5 rounded-lg border-2 transition-all ${
                  isCompleted
                    ? 'border-green-200 bg-green-50'
                    : isCurrent
                    ? 'border-blue-200 bg-blue-50'
                    : 'border-gray-200 bg-gray-50'
                }`}
              >
                {/* Статус уровня */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center mr-3 ${
                        isCompleted
                          ? 'bg-green-500 text-white'
                          : isCurrent
                          ? 'bg-blue-500 text-white'
                          : 'bg-gray-300 text-gray-600'
                      }`}
                    >
                      {isCompleted ? (
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      ) : (
                        level.level
                      )}
                    </div>
                    <div>
                      <h3
                        className={`text-lg font-semibold ${
                          isCompleted
                            ? 'text-green-700'
                            : isCurrent
                            ? 'text-blue-700'
                            : 'text-gray-600'
                        }`}
                      >
                        Уровень {level.level}: {level.name}
                      </h3>
                      <p className="text-sm text-gray-600">
                        Лимит операций: {level.limit}
                      </p>
                    </div>
                  </div>

                  <div
                    className={`px-3 py-1 rounded-full text-sm font-medium ${
                      isCompleted
                        ? 'bg-green-100 text-green-700'
                        : isCurrent
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {isCompleted ? '✅ Завершен' : isCurrent ? '🔄 Доступен' : '🔒 Заблокирован'}
                  </div>
                </div>

                {/* Требования уровня */}
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-gray-700">Требования:</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {level.requirements.map((requirement, index) => {
                      const isRequirementCompleted = getRequirementStatus(requirement);
                      return (
                        <div
                          key={index}
                          className={`flex items-center text-sm ${
                            isRequirementCompleted ? 'text-green-600' : 'text-gray-600'
                          }`}
                        >
                          <span className="mr-2">
                            {isRequirementCompleted ? '✅' : '⭕'}
                          </span>
                          {requirement}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Кнопка действия для текущего уровня */}
                {isCurrent && (
                  <div className="mt-4 pt-4 border-t border-blue-200">
                    <p className="text-sm text-blue-700 mb-3">
                      Завершите все требования для перехода на этот уровень
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {level.requirements.map((requirement, index) => {
                        const isRequirementCompleted = getRequirementStatus(requirement);
                        if (isRequirementCompleted) return null;

                        return (
                          <button
                            key={index}
                            onClick={() => {
                              if (requirement === 'Подтверждение телефона') {
                                handleVerifyPhone();
                              } else if (requirement === 'Подтверждение email') {
                                handleVerifyEmail();
                              } else if (requirement === 'Загрузка документов') {
                                onNavigateToDocuments?.();
                              }
                            }}
                            className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 transition-colors"
                          >
                            {requirement === 'Подтверждение телефона' && 'Подтвердить телефон'}
                            {requirement === 'Подтверждение email' && 'Подтвердить email'}
                            {requirement === 'Загрузка документов' && 'Загрузить документы'}
                            {requirement === 'Верификация через Госуслуги' && 'Войти через Госуслуги'}
                            {requirement === 'Подтверждение банковской карты' && 'Добавить карту'}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <VerificationModal
        isOpen={verificationModal.isOpen}
        onClose={closeModal}
        type={verificationModal.type}
        target={verificationModal.target}
        onSuccess={(verified) => handleVerificationSuccess(verified, verificationModal.type)}
      />
    </>
  );
}