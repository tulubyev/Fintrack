/**
 * Frontend Configuration Service
 * Manages centralized configuration for the frontend application
 * Fetches config from backend and provides typed access to configuration values
 */

export interface FrontendConfig {
  ui: {
    verification: {
      smsTimeout: number;
      emailTimeout: number;
      maxRetries: number;
    };
    uploads: {
      maxFileSize: number;
      maxFileSizeMB: number;
    };
    chat: {
      contextSize: number;
      maxMessageLength: number;
    };
    sidebar: {
      cookieName: string;
      cookieMaxAge: number;
      width: number;
      widthMobile: number;
      widthIcon: number;
      keyboardShortcut: string;
    };
    toast: {
      limit: number;
      removeDelay: number;
    };
    chart: {
      animationDuration: number;
    };
  };
  
  api: {
    endpoints: {
      auth: {
        login: string;
        register: string;
        refresh: string;
        verify: string;
        logout: string;
      };
      verification: {
        sendSms: string;
        sendEmail: string;
        verifySms: string;
        verifyEmail: string;
      };
      banks: {
        connections: string;
        available: string;
        connect: string;
        realConnect: string;
        sync: string;
      };
      accounts: string;
      transactions: string;
      profile: {
        update: string;
        uploadImage: string;
      };
      documents: {
        list: string;
        upload: string;
        download: string;
        types: string;
      };
      ai: {
        chat: string;
        session: string;
        message: string;
        insights: string;
      };
      dashboard: string;
      admin: {
        users: string;
        documents: string;
        system: string;
      };
      twoFactor: {
        status: string;
        setup: string;
        enable: string;
        disable: string;
      };
      esia: {
        authorize: string;
        mock: string;
      };
    };
    timeout: number;
    retryAttempts: number;
  };
  
  business: {
    verification: {
      limits: {
        unverified: string;
        phone: string;
        documents: string;
      };
      requirements: string[];
    };
    sync: {
      defaultInterval: string;
      maxRetries: number;
    };
  };
  
  environment: {
    isProduction: boolean;
    isDevelopment: boolean;
    version: string;
  };
}

class ConfigService {
  private config: FrontendConfig | null = null;
  private isLoading = false;
  private loadPromise: Promise<FrontendConfig> | null = null;

  /**
   * Get configuration (loads if not already loaded)
   */
  async getConfig(): Promise<FrontendConfig> {
    if (this.config) {
      return this.config;
    }

    if (this.isLoading && this.loadPromise) {
      return this.loadPromise;
    }

    this.isLoading = true;
    this.loadPromise = this.loadConfig();
    
    try {
      this.config = await this.loadPromise;
      return this.config;
    } finally {
      this.isLoading = false;
      this.loadPromise = null;
    }
  }

  /**
   * Force reload configuration from server
   */
  async reloadConfig(): Promise<FrontendConfig> {
    this.config = null;
    return this.getConfig();
  }

  /**
   * Get configuration synchronously (returns null if not loaded)
   */
  getConfigSync(): FrontendConfig | null {
    return this.config;
  }

  /**
   * Load configuration from backend
   */
  private async loadConfig(): Promise<FrontendConfig> {
    try {
      const response = await fetch('/api/config/public', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        },
        // No auth required for public config
      });

      if (!response.ok) {
        throw new Error(`Failed to load config: ${response.status} ${response.statusText}`);
      }

      const config = await response.json();
      
      // Validate config structure
      if (!config.ui || !config.api || !config.business) {
        throw new Error('Invalid config structure received from server');
      }

      return config as FrontendConfig;
    } catch (error) {
      console.error('Failed to load frontend config:', error);
      
      // Return fallback config in case of error
      return this.getFallbackConfig();
    }
  }

  /**
   * Fallback configuration for when server is unavailable
   */
  private getFallbackConfig(): FrontendConfig {
    return {
      ui: {
        verification: {
          smsTimeout: 60,
          emailTimeout: 120,
          maxRetries: 3
        },
        uploads: {
          maxFileSize: 10 * 1024 * 1024,
          maxFileSizeMB: 10
        },
        chat: {
          contextSize: 5,
          maxMessageLength: 1000
        },
        sidebar: {
          cookieName: 'fintrack-sidebar-collapsed',
          cookieMaxAge: 365 * 24 * 60 * 60 * 1000,
          width: 280,
          widthMobile: 240,
          widthIcon: 80,
          keyboardShortcut: 'Ctrl+B'
        },
        toast: {
          limit: 1,
          removeDelay: 1000
        },
        chart: {
          animationDuration: 300
        }
      },
      api: {
        endpoints: {
          auth: {
            login: '/api/auth/login',
            register: '/api/auth/register',
            refresh: '/api/auth/refresh',
            verify: '/api/auth/verify',
            logout: '/api/auth/logout'
          },
          verification: {
            sendSms: '/api/verification/send-sms',
            sendEmail: '/api/verification/send-email',
            verifySms: '/api/verification/verify-sms',
            verifyEmail: '/api/verification/verify-email'
          },
          banks: {
            connections: '/api/banks/connections',
            available: '/api/banks/available',
            connect: '/api/banks/connect',
            realConnect: '/api/banks/real/connect',
            sync: '/api/banks/real/sync'
          },
          accounts: '/api/accounts',
          transactions: '/api/transactions',
          profile: {
            update: '/api/profile/update',
            uploadImage: '/api/profile/upload-image'
          },
          documents: {
            list: '/api/documents',
            upload: '/api/documents/upload',
            download: '/api/documents',
            types: '/api/documents/types'
          },
          ai: {
            chat: '/api/ai/chat',
            session: '/api/ai/chat/session',
            message: '/api/ai/chat/message',
            insights: '/api/ai/insights'
          },
          dashboard: '/api/dashboard',
          admin: {
            users: '/api/admin/users',
            documents: '/api/admin/documents',
            system: '/api/admin/system-info'
          },
          twoFactor: {
            status: '/api/auth/2fa/status',
            setup: '/api/auth/2fa/setup',
            enable: '/api/auth/2fa/enable',
            disable: '/api/auth/2fa/disable'
          },
          esia: {
            authorize: '/api/auth/esia/authorize',
            mock: '/api/auth/esia/mock'
          }
        },
        timeout: 30000,
        retryAttempts: 3
      },
      business: {
        verification: {
          limits: {
            unverified: '15 000 ₽/мес',
            phone: '100 000 ₽/мес',
            documents: '1 000 000 ₽/мес'
          },
          requirements: [
            'Подтверждение телефона',
            'Подтверждение email',
            'Загрузка документов'
          ]
        },
        sync: {
          defaultInterval: '15 минут',
          maxRetries: 5
        }
      },
      environment: {
        isProduction: false,
        isDevelopment: true,
        version: '1.0.0'
      }
    };
  }
}

// Export singleton instance
export const configService = new ConfigService();

// Export convenience functions
export const getConfig = () => configService.getConfig();
export const getConfigSync = () => configService.getConfigSync();
export const reloadConfig = () => configService.reloadConfig();