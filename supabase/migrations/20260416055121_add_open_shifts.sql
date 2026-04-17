create table if not exists open_shifts (
  id                  uuid primary key default gen_random_uuid(),
  date                date not null,
  project_id          text not null references projects(id) on delete cascade,
  required_role       text not null default '',
  required_strengths  text[] not null default '{}',
  claimed_by          text references employees(id) on delete set null,
  status              text not null default 'open',
  notes               text not null default '',
  created_at          timestamptz not null default now()
);
alter table open_shifts enable row level security;
create policy "public_access" on open_shifts for all using (true) with check (true);;
