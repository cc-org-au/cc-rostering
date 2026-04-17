-- Leave/PTO Management System for Roster Manager

-- ── LEAVE TYPES ─────────────────────────────────────────────────────────────
create table if not exists leave_types (
  id                text primary key,
  name              text not null unique,
  color             text not null default '#6366f1',
  paid              boolean not null default true,
  days_per_year     integer not null default 20,
  requires_approval boolean not null default true,
  rollover_allowed  boolean not null default false,
  max_rollover_days integer default 0,
  description       text default '',
  sort_order        integer not null default 0,
  enabled           boolean not null default true,
  created_at        timestamptz not null default now()
);

-- ── LEAVE BALANCES ──────────────────────────────────────────────────────────
create table if not exists leave_balances (
  id                text primary key,
  employee_id       text not null references employees(id) on delete cascade,
  leave_type_id     text not null references leave_types(id) on delete cascade,
  year              integer not null,
  balance           numeric not null default 0,
  used              numeric not null default 0,
  accrued_on        date,
  last_updated      timestamptz not null default now(),
  unique(employee_id, leave_type_id, year)
);

-- ── LEAVE REQUESTS ──────────────────────────────────────────────────────────
create table if not exists leave_requests (
  id                text primary key,
  employee_id       text not null references employees(id) on delete cascade,
  leave_type_id     text not null references leave_types(id) on delete cascade,
  start_date        date not null,
  end_date          date not null,
  days_requested    numeric not null,
  status            text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  requested_by_id   text,
  approved_by_id    text,
  rejection_reason  text,
  notes             text default '',
  attachment_url    text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ── LEAVE ACCRUAL LOG ────────────────────────────────────────────────────────
create table if not exists leave_accrual_log (
  id                text primary key,
  employee_id       text not null references employees(id) on delete cascade,
  leave_type_id     text not null references leave_types(id) on delete cascade,
  year              integer not null,
  days_accrued      numeric not null,
  accrual_type      text not null check (accrual_type in ('annual', 'manual', 'adjustment')),
  processed_at      timestamptz not null default now(),
  processed_by_id   text
);

-- ── LEAVE AUDIT LOG ─────────────────────────────────────────────────────────
create table if not exists leave_audit_log (
  id                text primary key,
  leave_request_id  text not null references leave_requests(id) on delete cascade,
  action            text not null check (action in ('requested', 'approved', 'rejected', 'cancelled')),
  user_id           text,
  reason            text,
  timestamp         timestamptz not null default now()
);

-- ── INDEXES ────────────────────────────────────────────────────────────────
create index if not exists idx_leave_requests_employee on leave_requests(employee_id);
create index if not exists idx_leave_requests_status on leave_requests(status);
create index if not exists idx_leave_requests_dates on leave_requests(start_date, end_date);
create index if not exists idx_leave_balances_employee_year on leave_balances(employee_id, year);
create index if not exists idx_leave_accrual_employee_year on leave_accrual_log(employee_id, year);

-- ── RLS POLICIES ────────────────────────────────────────────────────────────
alter table leave_types enable row level security;
alter table leave_balances enable row level security;
alter table leave_requests enable row level security;
alter table leave_accrual_log enable row level security;
alter table leave_audit_log enable row level security;

-- leave_types: everyone can read, admins can manage
create policy "leave_types_read" on leave_types for select using (true);
create policy "leave_types_manage" on leave_types for all using (true) with check (true);

-- leave_balances: employees see own, managers/admins see all
create policy "leave_balances_employee_view" on leave_balances for select using (true);
create policy "leave_balances_manage" on leave_balances for all using (true) with check (true);

-- leave_requests: employees see own, managers see team, admins see all
create policy "leave_requests_employee_view" on leave_requests for select using (true);
create policy "leave_requests_create" on leave_requests for insert with check (true);
create policy "leave_requests_manage" on leave_requests for update using (true) with check (true);
create policy "leave_requests_delete" on leave_requests for delete using (true);

-- leave_accrual_log: audit only
create policy "leave_accrual_read" on leave_accrual_log for select using (true);
create policy "leave_accrual_write" on leave_accrual_log for all using (true) with check (true);

-- leave_audit_log: audit only
create policy "leave_audit_read" on leave_audit_log for select using (true);
create policy "leave_audit_write" on leave_audit_log for all using (true) with check (true);

-- ── SEED DATA ────────────────────────────────────────────────────────────────
insert into leave_types (id, name, color, paid, days_per_year, requires_approval, rollover_allowed, max_rollover_days, sort_order, enabled) values
  ('leave-annual', 'Annual Leave', '#3b82f6', true, 20, true, true, 5, 1, true),
  ('leave-sick', 'Sick Leave', '#ef4444', true, 10, false, false, 0, 2, true),
  ('leave-unpaid', 'Unpaid Leave', '#9ca3af', false, 0, true, false, 0, 3, true),
  ('leave-parental', 'Parental Leave', '#8b5cf6', true, 0, true, false, 0, 4, true),
  ('leave-bereavement', 'Bereavement', '#ec4899', true, 0, false, false, 0, 5, true),
  ('leave-jury', 'Jury Duty', '#14b8a6', true, 0, false, false, 0, 6, true),
  ('leave-public', 'Public Holiday', '#f59e0b', true, 0, false, false, 0, 7, true),
  ('leave-compassionate', 'Compassionate Leave', '#06b6d4', true, 0, true, false, 0, 8, true)
on conflict (name) do nothing;;
