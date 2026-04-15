-- Roster Manager schema
-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/macarnrvvxkmqrpdjyja/sql

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

-- Enable RLS
alter table projects    enable row level security;
alter table employees   enable row level security;
alter table assignments enable row level security;

-- Open policies (no auth yet — tighten once auth is added)
create policy "public_access" on projects    for all using (true) with check (true);
create policy "public_access" on employees   for all using (true) with check (true);
create policy "public_access" on assignments for all using (true) with check (true);
