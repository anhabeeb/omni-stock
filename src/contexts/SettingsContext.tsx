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
  updateSettings: (newSettings: Partial<Settings>) => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = useQueryClient();
  const [theme, setThemeState] = useState<'dark' | 'light'>('dark');

  const { data: settings, isLoading } = useQuery<Settings>({
    queryKey: ['settings'],
    queryFn: async () => {
      const res = await fetch('/api/settings', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (!res.ok) throw new Error('Failed to fetch settings');
      return res.json();
    },
    enabled: !!localStorage.getItem('token'),
  });

  useEffect(() => {
    if (settings) {
      const savedTheme = localStorage.getItem('theme') as 'dark' | 'light';
      if (savedTheme && settings.user_theme_override_allowed) {
        setThemeState(savedTheme);
      } else {
        setThemeState(settings.default_theme as 'dark' | 'light');
      }
    }
  }, [settings]);

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('dark', 'light');
    root.classList.add(theme);
  }, [theme]);

  const setTheme = (newTheme: 'dark' | 'light') => {
    setThemeState(newTheme);
    localStorage.setItem('theme', newTheme);
  };

  const format = (amount: number) => {
    if (!settings) return amount.toString();
    return formatCurrency(amount, settings);
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
      if (!res.ok) throw new Error('Failed to update settings');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });

  return (
    <SettingsContext.Provider value={{ 
      settings: settings || null, 
      theme, 
      setTheme, 
      format, 
      isLoading,
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
