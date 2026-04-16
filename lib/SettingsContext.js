'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from './supabase';

const SettingsContext = createContext(null);

const DEFAULT_SETTINGS = {
  hpd: { value: 8, label: 'Hours per day' },
  org_name: { value: 'Organization' },
  org_logo_url: { value: '' },
  timezone: { value: 'Australia/Sydney', region: 'AU' },
  currency: { value: 'AUD' },
  fiscal_year_start_month: { value: 6 },
  default_rate: { value: 45, unit: 'hourly' },
  default_max_hours: { value: 160 },
  weekend_days: { value: [5, 6] },
  holidays: { value: [], country: 'AU' },
  default_employee_strengths: { value: [] },
  export_format: { value: 'csv' },
  backup_retention_days: { value: 30 },
};

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch settings on mount
  useEffect(() => {
    fetchSettings();
    
    // Subscribe to real-time updates
    const subscription = supabase
      .channel('settings_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'settings' },
        (payload) => {
          if (payload.new) {
            setSettings(prev => ({
              ...prev,
              [payload.new.key]: payload.new.value
            }));
          }
        }
      )
      .subscribe();
    
    return () => {
      subscription.unsubscribe();
    };
  }, []);

  async function fetchSettings() {
    try {
      setLoading(true);
      const { data, error: err } = await supabase
        .from('settings')
        .select('key, value');
      
      if (err) throw err;
      
      const normalized = { ...DEFAULT_SETTINGS };
      if (data) {
        data.forEach(row => {
          if (row.value) normalized[row.key] = row.value;
        });
      }
      setSettings(normalized);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch settings:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SettingsContext.Provider value={{ settings, loading, error, fetchSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettingsContext() {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error('useSettingsContext must be used within SettingsProvider');
  }
  return ctx;
}
