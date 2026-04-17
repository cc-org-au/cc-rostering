create table if not exists shift_swaps (
  id            uuid primary key default gen_random_uuid(),
  requester_id  text not null references employees(id) on delete cascade,
  acceptor_id   text references employees(id) on delete set null,
  shift_date    date not null,
  project_id    text not null references projects(id) on delete cascade,
  status        text not null default 'pending',
  notes         text not null default '',
  created_at    timestamptz not null default now()
);
alter table shift_swaps enable row level security;
create policy "public_access" on shift_swaps for all using (true) with check (true);;
