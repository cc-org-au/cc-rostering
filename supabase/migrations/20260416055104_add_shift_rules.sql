create table if not exists shift_rules (
  id                        integer primary key default 1,
  max_hours_per_day         numeric not null default 10,
  max_hours_per_week        numeric not null default 50,
  overtime_threshold_daily  numeric not null default 8,
  overtime_threshold_weekly numeric not null default 38,
  min_break_minutes         integer not null default 30,
  check (id = 1)
);
insert into shift_rules (id) values (1) on conflict do nothing;
alter table shift_rules enable row level security;
create policy "public_access" on shift_rules for all using (true) with check (true);;
