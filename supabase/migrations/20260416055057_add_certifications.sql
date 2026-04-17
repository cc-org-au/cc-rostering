create table if not exists certifications (
  id           uuid primary key default gen_random_uuid(),
  employee_id  text not null references employees(id) on delete cascade,
  name         text not null,
  issued_date  date,
  expiry_date  date,
  notes        text not null default '',
  created_at   timestamptz not null default now()
);
alter table certifications enable row level security;
create policy "public_access" on certifications for all using (true) with check (true);;
