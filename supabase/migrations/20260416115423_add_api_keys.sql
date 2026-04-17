-- API keys for programmatic access (hashed at rest; plain key never stored)
create table if not exists api_keys (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  key_prefix text not null,
  key_hash text not null unique,
  scopes text[] not null default '{}',
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_used_at timestamptz
);

create index if not exists idx_api_keys_hash on api_keys(key_hash) where revoked_at is null;

comment on table api_keys is 'Server-side only via service role; never expose key_hash to clients.';

alter table api_keys enable row level security;
-- No policies: only service role (bypasses RLS) may access this table from API routes.;
