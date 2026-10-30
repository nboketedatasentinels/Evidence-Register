-- AI System Register: who owns each AI system in scope, how risky it is, and
-- which requirements cover it. The names stay in organisations.systems, which
-- save_register writes; this table holds the rest, keyed by the same name.
begin;

create table if not exists ai_systems (
  organisation_id text not null references organisations(id) on delete cascade,
  name text not null,
  purpose text not null default '',
  owner_id text not null default '',
  risk text not null default 'unrated' check (risk in ('high', 'medium', 'low', 'unrated')),
  control_ids text[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (organisation_id, name)
);

-- Only the server, with the secret key, reads or writes it.
alter table ai_systems enable row level security;

commit;
