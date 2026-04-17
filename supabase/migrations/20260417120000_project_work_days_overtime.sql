-- Project schedule: which days of week work runs; optional overtime note for the team.
alter table projects add column if not exists work_days jsonb not null default '{"Mon":true,"Tue":true,"Wed":true,"Thu":true,"Fri":true,"Sat":false,"Sun":false}';
alter table projects add column if not exists overtime_note text not null default '';
