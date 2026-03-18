import React, { createContext, useContext, useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatCurrency, CurrencySettings } from '../utils/currency';

interface Settings extends CurrencySettings {
  system_name: string;
  company_name: string;
  date_format: string;
  timezone: string;
  dark_mode_enabled: number;
  light_mode_enabled: number;
  default_theme: string;
  user_theme_override_allowed: number;
  allow_negative_stock: number;
  default_fefo_behavior: number;
  expiry_warning_threshold_days: number;
  low_stock_threshold_percent: number;
  stock_count_approval_required: number;
  wastage_approval_required: number;
  notification_threshold_high: number;
  enable_expiry_alerts: number;
  enable_low_stock_alerts: number;
  enable_wastage_alerts: number;
}

interface SettingsContextType {
  settings: Settings | null;
  theme: 'dark' | 'light';
  setTheme: (theme: 'dark' | 'light') => void;
  format: (amount: number) => string;
  isLoading: boolean;
  error: string | null;
  updateSettings: (newSettings: Partial<Settings>) => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

const defaultSettings: Settings = {
  system_name: 'OmniStock',
  company_name: '',
  default_currency: 'MVR',
  currency_symbol: 'MVR',
  currency_position: 'before',
  decimal_places: 2,
  date_format: 'YYYY-MM-DD',
  timezone: 'Asia/Male',
  dark_mode_enabled: 1,
  light_mode_enabled: 1,
  default_theme: 'dark',
  user_theme_override_allowed: 1,
  allow_negative_stock: 0,
  default_fefo_behavior: 1,
  expiry_warning_threshold_days: 30,
  low_stock_threshold_percent: 10,
  stock_count_approval_required: 1,
  wastage_approval_required: 1,
  notification_threshold_high: 20,
  enable_expiry_alerts: 1,
  enable_low_stock_alerts: 1,
  enable_wastage_alerts: 1,
};

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = useQueryClient();
  const [theme, setThemeState] = useState<'dark' | 'light'>('dark');
  const token = localStorage.getItem('token');

  const { data, isLoading, error } = useQuery<Settings>({
    queryKey: ['settings'],
    queryFn: async () => {
      const res = await fetch('/api/settings', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error(`Failed to fetch settings (${res.status})`);
      const json = await res.json() as Partial<Settings>;
      return { ...defaultSettings, ...json };
    },
    enabled: !!token,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const settings = token ? (data ?? null) : null;

  useEffect(() => {
    if (settings) {
      const savedTheme = localStorage.getItem('theme') as 'dark' | 'light';
      if (savedTheme && settings.user_theme_override_allowed && 
          ((savedTheme === 'dark' && settings.dark_mode_enabled) || 
           (savedTheme === 'light' && settings.light_mode_enabled))) {
        setThemeState(savedTheme);
      } else {
        const defaultTheme = settings.default_theme === 'light' && settings.light_mode_enabled ? 'light' : 'dark';
        setThemeState(defaultTheme);
      }
    }
  }, [settings]);

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('dark', 'light');
    root.classList.add(theme);
  }, [theme]);

  const setTheme = (newTheme: 'dark' | 'light') => {
    if (!settings) return;
    if (newTheme === 'dark' && !settings.dark_mode_enabled) return;
    if (newTheme === 'light' && !settings.light_mode_enabled) return;

    setThemeState(newTheme);
    localStorage.setItem('theme', newTheme);
  };

  const format = (amount: number) => {
    return formatCurrency(amount, settings || defaultSettings);
  };

  const updateMutation = useMutation({
    mutationFn: async (newSettings: Partial<Settings>) => {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(newSettings),
      });
      if (!res.ok) throw new Error(`Failed to update settings (${res.status})`);
      return res.json().catch(() => null);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });

  return (
    <SettingsContext.Provider value={{ 
      settings, 
      theme, 
      setTheme, 
      format, 
      isLoading,
      error: error ? (error as Error).message : null,
      updateSettings: updateMutation.mutateAsync
    }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('useSettings must be used within a SettingsProvider');
  return context;
};
