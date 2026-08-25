import { useState, useEffect } from 'react';

// Хук для управления финансовым дашбордом
export const useDashboard = (userId?: string) => {
  // Состояния данных дашборда
  const [bankConnections, setBankConnections] = useState<any[]>([]);
  const [availableBanks, setAvailableBanks] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [portfolio, setPortfolio] = useState<any>(null);
  const [assets, setAssets] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  
  // Состояния загрузки
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(false);
  const [isLoadingBanks, setIsLoadingBanks] = useState(false);
  const [isLoadingPortfolio, setIsLoadingPortfolio] = useState(false);
  
  // Состояния UI
  const [selectedBank, setSelectedBank] = useState('');
  const [activeView, setActiveView] = useState('overview');

  // Функция загрузки банковских подключений
  const fetchBankConnections = async () => {
    if (!userId) return;
    
    setIsLoadingBanks(true);
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/banks/connections', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setBankConnections(data.connections || []);
        setAvailableBanks(data.availableBanks || []);
        setAccounts(data.accounts || []);
      }
    } catch (error) {
      console.error('Ошибка загрузки банковских подключений:', error);
    } finally {
      setIsLoadingBanks(false);
    }
  };

  // Функция загрузки инвестиционного портфеля
  const fetchPortfolio = async () => {
    if (!userId) return;
    
    setIsLoadingPortfolio(true);
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/investments/portfolio', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setPortfolio(data.portfolio);
        setAssets(data.assets || []);
        setTransactions(data.transactions || []);
      }
    } catch (error) {
      console.error('Ошибка загрузки портфеля:', error);
    } finally {
      setIsLoadingPortfolio(false);
    }
  };

  // Функция подключения к банку
  const connectToBank = async (bankCode: string, credentials: any) => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/banks/connect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          bankCode,
          credentials
        })
      });

      if (response.ok) {
        await fetchBankConnections(); // Обновляем список подключений
        return true;
      }
      return false;
    } catch (error) {
      console.error('Ошибка подключения к банку:', error);
      return false;
    }
  };

  // Функция синхронизации данных
  const syncBankData = async (connectionId?: string) => {
    try {
      const token = localStorage.getItem('accessToken');
      const url = connectionId 
        ? `/api/banks/sync/${connectionId}` 
        : '/api/banks/sync';
        
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        await fetchBankConnections(); // Обновляем данные
        return true;
      }
      return false;
    } catch (error) {
      console.error('Ошибка синхронизации:', error);
      return false;
    }
  };

  // Функция загрузки всех данных дашборда
  const loadDashboardData = async () => {
    if (!userId) return;
    
    setIsLoadingDashboard(true);
    try {
      await Promise.all([
        fetchBankConnections(),
        fetchPortfolio()
      ]);
    } finally {
      setIsLoadingDashboard(false);
    }
  };

  // Загружаем данные при изменении userId
  useEffect(() => {
    if (userId) {
      loadDashboardData();
    }
  }, [userId]);

  return {
    // Данные
    bankConnections,
    availableBanks,
    accounts,
    portfolio,
    assets,
    transactions,
    
    // Состояния загрузки
    isLoadingDashboard,
    isLoadingBanks,
    isLoadingPortfolio,
    
    // Состояния UI
    selectedBank,
    activeView,
    setSelectedBank,
    setActiveView,
    
    // Функции
    fetchBankConnections,
    fetchPortfolio,
    connectToBank,
    syncBankData,
    loadDashboardData,
    
    // Функции обновления состояния
    setBankConnections,
    setAvailableBanks,
    setAccounts,
    setPortfolio,
    setAssets,
    setTransactions,
  };
};