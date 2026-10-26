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
    color: 'text-warning',
    bgColor: 'bg-warning-subtle border-warning/30'
  },
  {
    level: 2,
    name: 'Стандартная',
    limit: '100 000 ₽/мес',
    requirements: ['Подтверждение телефона', 'Подтверждение email', 'Загрузка документов'],
    color: 'text-primary',
    bgColor: 'bg-primary-subtle border-primary/30'
  },
  {
    level: 3,
    name: 'Полная',
    limit: '600 000 ₽/мес',
    requirements: ['Подтверждение телефона', 'Подтверждение email', 'Верификация через Госуслуги', 'Подтверждение банковской карты'],
    color: 'text-success',
    bgColor: 'bg-success-subtle border-success/30'
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
    color: 'text-foreground',
    bgColor: 'bg-muted border-border'
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
          <h2 className="text-xl font-semibold text-foreground">Система верификации</h2>
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
                    ? 'border-success/30 bg-success-subtle'
                    : isCurrent
                    ? 'border-primary/30 bg-primary-subtle'
                    : 'border-border bg-muted'
                }`}
              >
                {/* Статус уровня */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center mr-3 ${
                        isCompleted
                          ? 'bg-success text-primary-foreground'
                          : isCurrent
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted-foreground/40 text-muted-foreground'
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
                            ? 'text-success'
                            : isCurrent
                            ? 'text-primary'
                            : 'text-muted-foreground'
                        }`}
                      >
                        Уровень {level.level}: {level.name}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Лимит операций: {level.limit}
                      </p>
                    </div>
                  </div>

                  <div
                    className={`px-3 py-1 rounded-full text-sm font-medium ${
                      isCompleted
                        ? 'bg-success-subtle text-success'
                        : isCurrent
                        ? 'bg-primary-subtle text-primary'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {isCompleted ? '✅ Завершен' : isCurrent ? '🔄 Доступен' : '🔒 Заблокирован'}
                  </div>
                </div>

                {/* Требования уровня */}
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-foreground">Требования:</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {level.requirements.map((requirement, index) => {
                      const isRequirementCompleted = getRequirementStatus(requirement);
                      return (
                        <div
                          key={index}
                          className={`flex items-center text-sm ${
                            isRequirementCompleted ? 'text-success' : 'text-muted-foreground'
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
                  <div className="mt-4 pt-4 border-t border-primary/30">
                    <p className="text-sm text-primary mb-3">
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
                            className="px-3 py-1 bg-primary text-primary-foreground rounded text-sm hover:bg-primary transition-colors"
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