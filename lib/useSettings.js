import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';

// Default settings cache
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

export function useSettings() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dirty, setDirty] = useState(false);

  // Fetch all settings on mount
  useEffect(() => {
    fetchAllSettings();
  }, []);

  async function fetchAllSettings() {
    try {
      setLoading(true);
      setError(null);
      const { data, error: err } = await supabase
        .from('settings')
        .select('key, value')
        .in('key', Object.keys(DEFAULT_SETTINGS));
      
      if (err) throw err;
      
      const normalized = { ...DEFAULT_SETTINGS };
      if (data) {
        data.forEach(row => {
          if (row.value) normalized[row.key] = row.value;
        });
      }
      setSettings(normalized);
    } catch (err) {
      console.error('Failed to fetch settings:', err);
      setError(err.message);
      setSettings(DEFAULT_SETTINGS);
    } finally {
      setLoading(false);
    }
  }

  const getSetting = useCallback((key) => {
    return settings[key]?.value ?? DEFAULT_SETTINGS[key]?.value;
  }, [settings]);

  const setSetting = useCallback(async (key, value, description = '') => {
    try {
      // Optimistic update
      const oldValue = settings[key];
      setSettings(prev => ({
        ...prev,
        [key]: { ...prev[key], value }
      }));

      const settingData = settings[key] || DEFAULT_SETTINGS[key] || {};
      const updateValue = { ...settingData, value };

      const { error: err } = await supabase
        .from('settings')
        .upsert({
          key,
          value: updateValue,
          description: description || settingData.description || '',
          updated_at: new Date().toISOString(),
        });

      if (err) {
        // Rollback on error
        setSettings(prev => ({ ...prev, [key]: oldValue }));
        throw err;
      }
      
      setDirty(false);
      return true;
    } catch (err) {
      console.error(`Failed to set ${key}:`, err);
      setError(err.message);
      return false;
    }
  }, [settings]);

  const updateBulk = useCallback(async (updates) => {
    try {
      // Optimistic updates
      const oldSettings = { ...settings };
      const newSettings = { ...settings };
      
      Object.entries(updates).forEach(([key, value]) => {
        if (newSettings[key]) {
          newSettings[key] = { ...newSettings[key], value };
        }
      });
      
      setSettings(newSettings);

      // Batch upsert
      const rows = Object.entries(updates).map(([key, value]) => ({
        key,
        value: newSettings[key],
        updated_at: new Date().toISOString(),
      }));

      const { error: err } = await supabase
        .from('settings')
        .upsert(rows);

      if (err) {
        // Rollback
        setSettings(oldSettings);
        throw err;
      }

      setDirty(false);
      return true;
    } catch (err) {
      console.error('Failed to update settings bulk:', err);
      setError(err.message);
      return false;
    }
  }, [settings]);

  const refresh = useCallback(async () => {
    await fetchAllSettings();
  }, []);

  return {
    settings,
    loading,
    error,
    dirty,
    getSetting,
    setSetting,
    updateBulk,
    refresh,
  };
}
