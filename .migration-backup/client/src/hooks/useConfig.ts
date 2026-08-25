/**
 * React Hook for accessing centralized configuration
 * Provides reactive access to config values with automatic loading
 */

import { useState, useEffect } from 'react';
import { configService, type FrontendConfig } from '../services/configService';

export interface UseConfigResult {
  config: FrontendConfig | null;
  isLoading: boolean;
  error: Error | null;
  reload: () => Promise<void>;
}

/**
 * Hook to access frontend configuration
 * Automatically loads config on first use and provides reactive updates
 */
export function useConfig(): UseConfigResult {
  const [config, setConfig] = useState<FrontendConfig | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const loadConfig = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const newConfig = await configService.getConfig();
      setConfig(newConfig);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to load config');
      setError(error);
      console.error('Failed to load config:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const reload = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const newConfig = await configService.reloadConfig();
      setConfig(newConfig);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to reload config');
      setError(error);
      console.error('Failed to reload config:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Load config on mount
  useEffect(() => {
    loadConfig();
  }, []);

  return {
    config,
    isLoading,
    error,
    reload
  };
}

/**
 * Hook to access specific config path with type safety
 * Example: const endpoints = useConfigPath(config => config.api.endpoints)
 */
export function useConfigPath<T>(
  selector: (config: FrontendConfig) => T
): T | null {
  const { config } = useConfig();
  
  if (!config) {
    return null;
  }

  try {
    return selector(config);
  } catch (error) {
    console.error('Error accessing config path:', error);
    return null;
  }
}