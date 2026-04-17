create table if not exists pto_requests (
  id           uuid primary key default gen_random_uuid(),
  employee_id  text not null references employees(id) on delete cascade,
  start_date   date not null,
  end_date     date not null,
  type         text not null default 'Annual Leave',
  status       text not null default 'pending',
  notes        text not null default '',
  created_at   timestamptz not null default now()
);
alter table pto_requests enable row level security;
create policy "public_access" on pto_requests for all using (true) with check (true);;
