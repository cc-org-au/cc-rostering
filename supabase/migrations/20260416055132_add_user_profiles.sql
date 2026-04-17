create table if not exists user_profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  employee_id  text references employees(id) on delete set null,
  role         text not null default 'employee',
  created_at   timestamptz not null default now()
);
alter table user_profiles enable row level security;
create policy "public_access" on user_profiles for all using (true) with check (true);;
