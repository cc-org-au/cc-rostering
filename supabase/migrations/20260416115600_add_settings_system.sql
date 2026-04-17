-- Settings & configuration (org defaults, timezone, holidays, etc.)

-- ── CREATE SETTINGS TABLE ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
  key               TEXT PRIMARY KEY,
  value             JSONB NOT NULL,
  description       TEXT DEFAULT '',
  updated_by        UUID,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── INITIALIZE SETTINGS ────────────────────────────────────────────────────
INSERT INTO settings (key, value, description) VALUES
  ('hpd', '{"value": 8, "label": "Hours per day"}', 'Standard hours per working day'),
  ('org_name', '{"value": "Organization"}', 'Organization name'),
  ('org_logo_url', '{"value": ""}', 'Logo URL for branding'),
  ('timezone', '{"value": "Australia/Sydney", "region": "AU"}', 'Default timezone'),
  ('currency', '{"value": "AUD"}', 'Currency code'),
  ('fiscal_year_start_month', '{"value": 6}', 'Fiscal year start (0=Jan, 5=June, etc)'),
  ('default_rate', '{"value": 45, "unit": "hourly"}', 'Default hourly rate for employees'),
  ('default_max_hours', '{"value": 160}', 'Default monthly hours limit'),
  ('weekend_days', '{"value": [5, 6]}', 'Weekend day indices (5=Sat, 6=Sun)'),
  ('holidays', '{"value": [], "country": "AU"}', 'Public holidays array with dates and names'),
  ('default_employee_strengths', '{"value": []}', 'List of default skills/strengths'),
  ('export_format', '{"value": "csv"}', 'Default export format'),
  ('backup_retention_days', '{"value": 30}', 'Days to retain backups')
ON CONFLICT (key) DO NOTHING;

-- ── ENABLE RLS ─────────────────────────────────────────────────────────────
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- ── RLS POLICIES ────────────────────────────────────────────────────────────
-- (IF NOT EXISTS is not valid for CREATE POLICY on all Postgres versions)
DROP POLICY IF EXISTS "settings_read" ON settings;
CREATE POLICY "settings_read" ON settings FOR SELECT USING (true);

DROP POLICY IF EXISTS "settings_update" ON settings;
CREATE POLICY "settings_update" ON settings FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "settings_insert" ON settings;
CREATE POLICY "settings_insert" ON settings FOR INSERT WITH CHECK (true);
