import { useState } from "react";
import { useAuth } from "../../hooks/useAuth";
import { Button } from "@/components/ui/button";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Bell, Settings, LogOut } from "lucide-react";
import BankConnectionModal from "../modals/BankConnectionModal";

export default function Header() {
  const { user, logout } = useAuth();
  const [showBankModal, setShowBankModal] = useState(false);

  const getUserInitials = () => {
    if (!user) return "ГУ";
    return `${user.firstName?.charAt(0) ?? ''}${user.lastName?.charAt(0) ?? ''}` || "ГУ";
  };

  const handleConnectBank = async (bankCode: string) => {
    // This will be handled in the BankConnectionModal
    console.log("Connecting bank:", bankCode);
  };

  return (
    <>
      <header className="bg-card border-b border-border sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo */}
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                  <span className="text-primary-foreground font-bold text-lg">₽</span>
                </div>
                <h1 className="text-xl font-bold text-foreground">FinTrack</h1>
              </div>
            </div>
            
            {/* Navigation */}
            <nav className="hidden md:flex space-x-6">
              <a href="#" className="text-primary font-medium border-b-2 border-primary pb-2">
                Обзор
              </a>
              <a href="#" className="text-muted-foreground hover:text-foreground">
                Счета
              </a>
              <a href="#" className="text-muted-foreground hover:text-foreground">
                Бюджет
              </a>
              <a href="#" className="text-muted-foreground hover:text-foreground">
                Цели
              </a>
              <a href="#" className="text-muted-foreground hover:text-foreground">
                Инвестиции
              </a>
            </nav>
            
            {/* User Actions */}
            <div className="flex items-center space-x-4">
              <Button 
                onClick={() => setShowBankModal(true)}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
                data-testid="button-connect-bank"
              >
                + Подключить банк
              </Button>
              
              <Button 
                variant="outline" 
                size="sm"
                data-testid="button-export"
              >
                📤 Экспорт
              </Button>

              <Button variant="ghost" size="icon" data-testid="button-notifications">
                <Bell className="h-5 w-5" />
              </Button>
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="flex items-center space-x-2" data-testid="button-user-menu">
                    <Avatar className="w-8 h-8">
                      <AvatarFallback className="bg-secondary text-secondary-foreground">
                        {getUserInitials()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium text-foreground hidden sm:block">
                      {user?.firstName} {user?.lastName}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem 
                    className="cursor-pointer"
                    onClick={() => window.location.href = '/security'}
                    data-testid="menu-settings"
                  >
                    <Settings className="mr-2 h-4 w-4" />
                    Безопасность
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={logout} data-testid="menu-logout">
                    <LogOut className="mr-2 h-4 w-4" />
                    Выйти
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </header>

      <BankConnectionModal 
        isOpen={showBankModal}
        onClose={() => setShowBankModal(false)}
        onConnect={handleConnectBank}
      />
    </>
  );
}
