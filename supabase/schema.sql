-- Roster Manager schema
-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/macarnrvvxkmqrpdjyja/sql

-- ── AUTHENTICATION ─────────────────────────────────────────────────────────────

-- Application users table linked to Supabase Auth
create table if not exists app_users (
  id uuid references auth.users on delete cascade primary key,
  email text not null unique,
  full_name text not null default '',
  role text not null default 'employee' check (role in ('admin', 'manager', 'dispatcher', 'employee')),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Audit logs for tracking user actions
create table if not exists auth_audit_logs (
  id bigserial primary key,
  user_id uuid references auth.users on delete cascade,
  action text not null,
  details jsonb,
  created_at timestamptz not null default now()
);

-- ── RLS POLICIES ───────────────────────────────────────────────────────────────

alter table app_users enable row level security;
alter table auth_audit_logs enable row level security;

-- Users can view their own profile
create policy "users_view_own" on app_users for select
  using (auth.uid() = id);

-- Users can update their own profile
create policy "users_update_own" on app_users for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Admins can view all users
create policy "admins_view_all_users" on app_users for select
  using ((select role from app_users where id = auth.uid()) = 'admin');

-- Admins can update any user
create policy "admins_update_all_users" on app_users for update
  using ((select role from app_users where id = auth.uid()) = 'admin')
  with check ((select role from app_users where id = auth.uid()) = 'admin');

-- Users can view their own audit logs
create policy "users_view_own_audit" on auth_audit_logs for select
  using (auth.uid() = user_id);

-- Admins can view all audit logs
create policy "admins_view_all_audit" on auth_audit_logs for select
  using ((select role from app_users where id = auth.uid()) = 'admin');

-- ── ROSTERING TABLES ───────────────────────────────────────────────────────────

create table if not exists projects (
  id                  text primary key,
  name                text not null,
  client              text not null default '',
  color               text not null default '#4f46e5',
  notes               text not null default '',
  budget              text not null default '',
  charge_out_rate     text not null default '',
  total_input         text not null default '',
  total_unit          text not null default 'days',
  staff_mode          text not null default 'flexible',
  fixed_staff         text not null default '',
  start_month         text not null default '',
  start_year          text not null default '',
  end_month           text not null default '',
  end_year            text not null default '',
  monthly_hours       jsonb not null default '{}',
  strengths_required  text[] not null default '{}',
  is_completed        boolean not null default false,
  status              text not null default 'active',
  budget_total        numeric default 0,
  created_at          timestamptz not null default now()
);

create table if not exists employees (
  id                    text primary key,
  name                  text not null,
  role                  text not null default 'Labourer',
  type                  text not null default 'Full-time',
  rate                  text not null default '',
  phone                 text not null default '',
  email                 text not null default '',
  notes                 text not null default '',
  availability          jsonb not null default '{"Mon":true,"Tue":true,"Wed":true,"Thu":true,"Fri":true,"Sat":false,"Sun":false}',
  max_hours_per_month   integer not null default 160,
  strengths             text[] not null default '{}',
  certifications        text[] not null default '{}',
  emergency_contact     text default '',
  created_at            timestamptz not null default now()
);

create table if not exists assignments (
  year         integer not null,
  month        integer not null,
  day          integer not null,
  employee_id  text not null references employees(id) on delete cascade,
  project_id   text not null references projects(id)  on delete cascade,
  primary key (year, month, day, employee_id)
);

-- New shift-based scheduling tables
create table if not exists shifts (
  id                text primary key,
  project_id        text not null references projects(id) on delete cascade,
  date              date not null,
  start_time        time not null,
  end_time          time not null,
  role              text default '',
  required_skills   text[] not null default '{}',
  budget_hours      numeric default 0,
  required_count    integer default 1,
  status            text not null default 'open',
  created_at        timestamptz not null default now()
);

create table if not exists shift_assignments (
  id                text primary key,
  shift_id          text not null references shifts(id) on delete cascade,
  employee_id       text not null references employees(id) on delete cascade,
  assigned_at       timestamptz not null default now(),
  status            text not null default 'assigned',
  created_at        timestamptz not null default now()
);

create table if not exists shift_claims (
  id                text primary key,
  shift_id          text not null references shifts(id) on delete cascade,
  employee_id       text not null references employees(id) on delete cascade,
  claimed_at        timestamptz not null default now(),
  status            text not null default 'pending',
  created_at        timestamptz not null default now()
);

create table if not exists shift_swaps (
  id                text primary key,
  from_employee_id  text not null references employees(id),
  to_employee_id    text not null references employees(id),
  shift_id          text not null references shifts(id) on delete cascade,
  requested_at      timestamptz not null default now(),
  status            text not null default 'pending',
  created_at        timestamptz not null default now()
);

create table if not exists shift_rules (
  id                text primary key,
  name              text not null,
  rule_type         text not null,
  constraint_data   jsonb not null,
  threshold         numeric default 0,
  enabled_projects  text[] not null default '{}',
  enabled           boolean not null default true,
  created_at        timestamptz not null default now()
);

create table if not exists timesheets (
  id                text primary key,
  employee_id       text not null references employees(id) on delete cascade,
  shift_id          text references shifts(id),
  clock_in          timestamptz,
  clock_out         timestamptz,
  breaks_taken      integer default 0,
  actual_hours      numeric default 0,
  status            text not null default 'draft',
  created_at        timestamptz not null default now()
);

create table if not exists pto_requests (
  id                text primary key,
  employee_id       text not null references employees(id) on delete cascade,
  date_from         date not null,
  date_to           date not null,
  reason            text default '',
  status            text not null default 'pending',
  approved_at       timestamptz,
  created_at        timestamptz not null default now()
);

create table if not exists payroll_runs (
  id                text primary key,
  period_start      date not null,
  period_end        date not null,
  status            text not null default 'draft',
  total_cost        numeric default 0,
  created_at        timestamptz not null default now()
);

create table if not exists payroll_line_items (
  id                text primary key,
  payroll_run_id    text not null references payroll_runs(id) on delete cascade,
  employee_id       text not null references employees(id),
  shift_hours       numeric default 0,
  overtime_hours    numeric default 0,
  rate              numeric default 0,
  gross_amount      numeric default 0,
  deductions        numeric default 0,
  net_amount        numeric default 0,
  created_at        timestamptz not null default now()
);

create table if not exists automation_workflows (
  id                text primary key,
  name              text not null,
  trigger_type      text not null,
  trigger_config    jsonb not null,
  conditions        jsonb not null default '[]',
  actions           jsonb not null default '[]',
  enabled           boolean not null default true,
  created_at        timestamptz not null default now()
);

create table if not exists audit_log (
  id                text primary key,
  entity_type       text not null,
  entity_id         text not null,
  action            text not null,
  user_id           text,
  changes           jsonb,
  timestamp         timestamptz not null default now()
);

-- ── APPLICATION SETTINGS ───────────────────────────────────────────────────────
create table if not exists settings (
  key               text primary key,
  value             jsonb not null,
  description       text default '',
  updated_by        uuid,
  updated_at        timestamptz not null default now()
);

-- Unique index on key (already ensured by primary key)
-- Initial settings data
insert into settings (key, value, description) values
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
on conflict (key) do nothing;

-- ── ANALYTICS & REPORTING TABLES ──────────────────────────────────────────────

-- Stores snapshots of report data for historical analysis
create table if not exists report_snapshots (
  id                text primary key,
  report_type       text not null check (report_type in ('financial', 'utilization', 'headcount', 'projects', 'compliance', 'forecasts')),
  year              integer not null,
  month             integer not null,
  data              jsonb not null,
  created_by        uuid references auth.users on delete set null,
  created_at        timestamptz not null default now()
);

-- Revenue tracking per project/employee for financial reporting
create table if not exists revenue_logs (
  id                text primary key,
  project_id        text not null references projects(id) on delete cascade,
  employee_id       text not null references employees(id) on delete cascade,
  amount            numeric not null default 0,
  billable_hours    numeric not null default 0,
  date              date not null,
  created_at        timestamptz not null default now()
);

-- Create indices for fast queries
create index if not exists idx_report_snapshots_type_date 
  on report_snapshots(report_type, year, month);

create index if not exists idx_revenue_logs_project_date 
  on revenue_logs(project_id, date);

create index if not exists idx_revenue_logs_employee_date 
  on revenue_logs(employee_id, date);

create index if not exists idx_revenue_logs_date 
  on revenue_logs(date);

-- ── RLS for Analytics Tables ──────────────────────────────────────────────────

alter table report_snapshots enable row level security;
alter table revenue_logs enable row level security;

-- Employees see own revenue, managers see team, admins see all
create policy "revenue_logs_view" on revenue_logs for select
  using (
    (select role from app_users where id = auth.uid()) = 'admin'
    or employee_id = (select id from app_users where id = auth.uid())
  );

-- Reports: employees can read their own, managers can read all for now
create policy "report_snapshots_view" on report_snapshots for select
  using (true);

-- Enable RLS
alter table projects    enable row level security;
alter table employees   enable row level security;
alter table assignments enable row level security;
alter table shifts      enable row level security;
alter table shift_assignments enable row level security;
alter table shift_claims enable row level security;
alter table shift_swaps enable row level security;
alter table shift_rules enable row level security;
alter table timesheets  enable row level security;
alter table pto_requests enable row level security;
alter table payroll_runs enable row level security;
alter table payroll_line_items enable row level security;
alter table automation_workflows enable row level security;
alter table audit_log   enable row level security;
alter table settings    enable row level security;

-- Open policies (no auth yet — tighten once auth is added)
create policy "public_access" on projects    for all using (true) with check (true);
create policy "public_access" on employees   for all using (true) with check (true);
create policy "public_access" on assignments for all using (true) with check (true);
create policy "public_access" on shifts      for all using (true) with check (true);
create policy "public_access" on shift_assignments for all using (true) with check (true);
create policy "public_access" on shift_claims for all using (true) with check (true);
create policy "public_access" on shift_swaps for all using (true) with check (true);
create policy "public_access" on shift_rules for all using (true) with check (true);
create policy "public_access" on timesheets for all using (true) with check (true);
create policy "public_access" on pto_requests for all using (true) with check (true);
create policy "public_access" on payroll_runs for all using (true) with check (true);
create policy "public_access" on payroll_line_items for all using (true) with check (true);
create policy "public_access" on automation_workflows for all using (true) with check (true);
create policy "public_access" on audit_log for all using (true) with check (true);

-- Settings: all can read, only admins can update (future: integrate with app_users.role)
create policy "settings_read" on settings for select using (true);
create policy "settings_update" on settings for update using (true) with check (true);
create policy "settings_insert" on settings for insert with check (true);

-- ── NOTIFICATIONS & ALERTS SYSTEM ──────────────────────────────────────────────

-- User notification preferences
create table if not exists notification_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users on delete cascade,
  email_enabled boolean not null default true,
  sms_enabled boolean not null default false,
  in_app_enabled boolean not null default true,
  quiet_hours_enabled boolean not null default false,
  quiet_hours_start time default '22:00',
  quiet_hours_end time default '08:00',
  notification_sounds_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Alert types and configuration
create table if not exists alerts_config (
  id uuid primary key default gen_random_uuid(),
  alert_type text not null unique,
  enabled boolean not null default true,
  threshold numeric,
  message_template text not null,
  recipient_roles text[] not null default '{admin,manager}',
  severity text not null default 'info' check (severity in ('critical', 'high', 'medium', 'low', 'info')),
  channels text[] not null default '{in_app}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- In-app notifications
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  type text not null,
  title text not null,
  message text not null,
  related_entity_id text,
  related_entity_type text,
  action_url text,
  read boolean not null default false,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Notification delivery logs
create table if not exists notification_logs (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references notifications(id) on delete cascade,
  channel text not null check (channel in ('email', 'sms', 'in_app', 'push')),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'bounced', 'unsubscribed')),
  recipient text not null,
  sent_at timestamptz,
  error_message text,
  retry_count integer not null default 0,
  created_at timestamptz not null default now()
);

-- Alert trigger audit log
create table if not exists alert_audit_log (
  id uuid primary key default gen_random_uuid(),
  alert_type text not null,
  trigger_reason text not null,
  triggered_count integer not null default 1,
  user_ids uuid[] not null default '{}',
  notification_ids uuid[] not null default '{}',
  metadata jsonb default '{}',
  success boolean not null default true,
  error_message text,
  created_at timestamptz not null default now()
);

-- RLS Policies for notifications

alter table notification_preferences enable row level security;
alter table alerts_config enable row level security;
alter table notifications enable row level security;
alter table notification_logs enable row level security;
alter table alert_audit_log enable row level security;

-- Users can only see/modify their own preferences
create policy "users_view_own_prefs" on notification_preferences for select
  using (auth.uid() = user_id);

create policy "users_update_own_prefs" on notification_preferences for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users_insert_own_prefs" on notification_preferences for insert
  with check (auth.uid() = user_id);

-- Users can view their own notifications
create policy "users_view_own_notifications" on notifications for select
  using (auth.uid() = user_id);

-- Users can update their own notifications (mark as read, archive)
create policy "users_update_own_notifications" on notifications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Admins can view all alerts config
create policy "admins_view_alerts_config" on alerts_config for select
  using ((select role from app_users where id = auth.uid()) in ('admin', 'manager'));

-- Admins can update alerts config
create policy "admins_update_alerts_config" on alerts_config for update
  using ((select role from app_users where id = auth.uid()) = 'admin')
  with check ((select role from app_users where id = auth.uid()) = 'admin');

-- Admins can view notification logs
create policy "admins_view_notification_logs" on notification_logs for select
  using ((select role from app_users where id = auth.uid()) in ('admin', 'manager'));

-- Admins can view alert audit log
create policy "admins_view_alert_audit" on alert_audit_log for select
  using ((select role from app_users where id = auth.uid()) in ('admin', 'manager'));

-- Indices for performance
create index if not exists idx_notifications_user_created 
  on notifications(user_id, created_at desc);

create index if not exists idx_notifications_user_read 
  on notifications(user_id, read);

create index if not exists idx_notification_logs_status 
  on notification_logs(status);

create index if not exists idx_notification_logs_created 
  on notification_logs(created_at desc);

create index if not exists idx_alert_audit_log_type_created 
  on alert_audit_log(alert_type, created_at desc);

-- Default alert configurations
insert into alerts_config (alert_type, enabled, message_template, recipient_roles, severity, channels) values
  ('understaffed_project', true, 'Project "{project_name}" is understaffed. Current: {current_count}/{required_count} staff', '{manager,dispatcher}', 'high', '{in_app,email}'),
  ('double_booking_detected', true, 'Double booking detected for {employee_name} on {date}', '{dispatcher,manager}', 'critical', '{in_app,email,sms}'),
  ('employee_unavailable_assigned', true, '{employee_name} is marked unavailable on {date} but has assignment', '{dispatcher,manager}', 'high', '{in_app,email}'),
  ('max_hours_violation', true, '{employee_name} approaching max hours ({current}/{max}) in {month}', '{manager}', 'medium', '{in_app,email}'),
  ('certification_expiring_soon', true, '{employee_name} certification "{cert_name}" expires in {days} days', '{manager}', 'medium', '{in_app,email}'),
  ('budget_exceeded', true, 'Project "{project_name}" budget exceeded by ${overage}', '{manager,admin}', 'high', '{in_app,email}'),
  ('leave_conflict', true, 'Assignment conflict: {employee_name} has approved leave on {date} but scheduled', '{dispatcher}', 'high', '{in_app,email}'),
  ('roster_approval_pending', true, 'Roster for {month}/{year} pending approval', '{manager}', 'medium', '{in_app,email}'),
  ('skill_mismatch', true, '{employee_name} lacks required skill "{skill}" for {project_name}', '{dispatcher}', 'medium', '{in_app,email}'),
  ('leave_request_submitted', true, '{employee_name} submitted leave request for {start_date} to {end_date}', '{manager}', 'info', '{in_app,email}'),
  ('leave_request_approved', true, 'Your leave request for {start_date} to {end_date} has been approved', '{}', 'info', '{in_app,email}'),
  ('leave_request_denied', true, 'Your leave request for {start_date} to {end_date} has been denied', '{}', 'info', '{in_app,email}'),
  ('project_completed', true, 'Project "{project_name}" has been completed', '{manager}', 'info', '{in_app,email}'),
  ('system_backup_complete', true, 'Database backup completed successfully', '{admin}', 'info', '{in_app}'),
  ('user_activity_unusual', true, 'Unusual activity detected for user {user_email}', '{admin}', 'high', '{in_app,email}'),
  ('data_export_ready', true, 'Your data export is ready for download', '{}', 'info', '{in_app}')
on conflict (alert_type) do nothing;

-- ── API KEYS (server-side only; use SUPABASE_SERVICE_ROLE_KEY in API routes) ──
create table if not exists api_keys (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  key_prefix text not null,
  key_hash text not null unique,
  scopes text[] not null default '{}',
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_used_at timestamptz
);

create index if not exists idx_api_keys_hash on api_keys(key_hash) where revoked_at is null;

create table if not exists certifications (
  id text primary key,
  employee_id text not null references employees(id) on delete cascade,
  name text not null,
  expiry_date date,
  notes text default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_certifications_employee on certifications(employee_id);

alter table api_keys enable row level security;
