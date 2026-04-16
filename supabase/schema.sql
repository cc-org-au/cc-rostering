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
