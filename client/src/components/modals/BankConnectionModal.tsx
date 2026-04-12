import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Shield, Building2, CheckCircle2 } from "lucide-react";
import type { BankConnectionModalProps } from "../../types";

const availableBanks = [
  {
    code: 'sberbank',
    name: 'Сбербанк',
    description: 'Дебетовые и кредитные карты',
    logo: '🟢',
    popular: true,
  },
  {
    code: 'vtb',
    name: 'ВТБ',
    description: 'Счета и депозиты',
    logo: '🔵',
    popular: true,
  },
  {
    code: 'tinkoff',
    name: 'Тинькофф',
    description: 'Все продукты банка',
    logo: '🟡',
    popular: true,
  },
  {
    code: 'alfabank',
    name: 'Альфа-Банк',
    description: 'Карты и инвестиции',
    logo: '🔴',
    popular: false,
  },
  {
    code: 'gazprombank',
    name: 'Газпромбанк',
    description: 'Корпоративные и частные услуги',
    logo: '⚫',
    popular: false,
  },
];

export default function BankConnectionModal({ isOpen, onClose, onConnect }: BankConnectionModalProps) {
  const [selectedBank, setSelectedBank] = useState<string>('');
  const [step, setStep] = useState<'select' | 'confirm'>('select');

  const handleBankSelect = (bankCode: string) => {
    setSelectedBank(bankCode);
    setStep('confirm');
  };

  const handleConnect = () => {
    if (selectedBank) {
      onConnect(selectedBank);
      handleClose();
    }
  };

  const handleClose = () => {
    setStep('select');
    setSelectedBank('');
    onClose();
  };

  const selectedBankInfo = availableBanks.find(bank => bank.code === selectedBank);

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        {step === 'select' ? (
          <>
            <DialogHeader className="text-center">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Building2 className="h-8 w-8 text-primary" />
              </div>
              <DialogTitle className="text-xl font-bold">Подключение банка</DialogTitle>
              <DialogDescription>
                Безопасное подключение через систему ПКС (Платформа коммерческих согласий)
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-3">
              {availableBanks.map((bank) => (
                <div
                  key={bank.code}
                  className="p-4 border border-border rounded-lg hover:border-primary cursor-pointer transition-colors group"
                  onClick={() => handleBankSelect(bank.code)}
                  data-testid={`bank-option-${bank.code}`}
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-sm">
                      <span className="text-xl">{bank.logo}</span>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-foreground group-hover:text-primary transition-colors">
                          {bank.name}
                        </p>
                        {bank.popular && (
                          <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                            Популярный
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{bank.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-muted/50 p-4 rounded-lg mt-4">
              <div className="flex items-start space-x-2">
                <Shield className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                <div className="text-xs text-muted-foreground">
                  <p className="font-medium mb-1">Безопасность гарантирована:</p>
                  <ul className="space-y-1">
                    <li>• Сквозное шифрование данных</li>
                    <li>• Регулируется Центральным банком РФ</li>
                    <li>• Мы не храним ваши пароли</li>
                  </ul>
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            <DialogHeader className="text-center">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">{selectedBankInfo?.logo}</span>
              </div>
              <DialogTitle className="text-xl font-bold">Подключить {selectedBankInfo?.name}?</DialogTitle>
              <DialogDescription>
                Вы будете перенаправлены на безопасную страницу банка для авторизации
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="bg-muted/50 p-4 rounded-lg">
                <h4 className="font-medium text-foreground mb-2">Что произойдет дальше:</h4>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    <span>Переход на сайт {selectedBankInfo?.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    <span>Вход в интернет-банк</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    <span>Подтверждение доступа к данным</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    <span>Возврат в FinTrack</span>
                  </div>
                </div>
              </div>

              <div className="flex space-x-3">
                <Button 
                  variant="outline"
                  onClick={() => setStep('select')}
                  className="flex-1"
                  data-testid="button-back-to-selection"
                >
                  Назад
                </Button>
                <Button 
                  onClick={handleConnect}
                  className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
                  data-testid="button-confirm-connection"
                >
                  Подключить
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
