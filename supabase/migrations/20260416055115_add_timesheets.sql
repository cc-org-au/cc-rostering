create table if not exists timesheets (
  id           uuid primary key default gen_random_uuid(),
  employee_id  text not null references employees(id) on delete cascade,
  date         date not null,
  project_id   text references projects(id) on delete set null,
  clock_in     timestamptz,
  clock_out    timestamptz,
  hours_worked numeric,
  status       text not null default 'draft',
  notes        text not null default '',
  created_at   timestamptz not null default now(),
  unique (employee_id, date, project_id)
);
alter table timesheets enable row level security;
create policy "public_access" on timesheets for all using (true) with check (true);;
