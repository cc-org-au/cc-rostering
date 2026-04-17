-- Notifications system

create table if not exists notifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      text not null,
  type         text not null default 'info',
  title        text not null,
  message      text not null default '',
  data         jsonb,
  read         boolean not null default false,
  archived     boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists notification_preferences (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   text not null unique,
  email_enabled             boolean not null default true,
  in_app_enabled            boolean not null default true,
  sms_enabled               boolean not null default false,
  quiet_hours_enabled       boolean not null default false,
  quiet_hours_start         time,
  quiet_hours_end           time,
  notification_sounds_enabled boolean not null default true,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create index if not exists idx_notifications_user on notifications(user_id, created_at desc);
create index if not exists idx_notifications_unread on notifications(user_id, read) where read = false;

alter table notifications enable row level security;
alter table notification_preferences enable row level security;

create policy "notifications_user_access" on notifications for all using (true) with check (true);
create policy "notification_prefs_user_access" on notification_preferences for all using (true) with check (true);;
