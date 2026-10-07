alter table organisations add column if not exists website text not null default '';
alter table organisations add column if not exists size text not null default '';
alter table organisations add column if not exists description text not null default '';
alter table organisations add column if not exists contact_name text not null default '';
alter table organisations add column if not exists email_domain text not null default '';
alter table organisations add column if not exists created_at timestamptz;
alter table organisations add column if not exists systems text[] not null default '{}';

alter table departments add column if not exists parent_id text not null default '';

alter table people add column if not exists email text not null default '';
alter table people add column if not exists employment_type text not null default 'employee';
alter table people add column if not exists manager_id text not null default '';
alter table people add column if not exists age_range text not null default '';
alter table people add column if not exists drawn_signature text not null default '';
alter table people add column if not exists drawn_at timestamptz;

alter table controls add column if not exists template_id text not null default '';
alter table controls add column if not exists origin text not null default 'custom';
alter table controls add column if not exists responsibility_version integer not null default 1;

create table if not exists invitations (
  id text primary key,
  organisation_id text not null references organisations (id),
  name text not null default '',
  email text not null,
  unit text not null default '',
  job text not null default '',
  profile text not null,
  age_range text not null default '',
  signature_required boolean not null default false,
  token text not null,
  invited_by text not null default '',
  invited_at timestamptz not null default now(),
  status text not null default 'pending',
  person_id text not null default '',
  joined_at timestamptz
);

create table if not exists acknowledgements (
  id text primary key,
  organisation_id text not null references organisations (id),
  person_id text not null,
  kind text not null,
  control_id text not null default '',
  statement text not null default '',
  item_version integer not null default 1,
  status text not null,
  signature text not null default '',
  signed_at timestamptz,
  user_agent text not null default '',
  ip text not null default ''
);

create table if not exists accounts (
  email text primary key,
  person_id text not null,
  salt text not null,
  password_hash text not null,
  created_at timestamptz not null default now()
);

alter table accounts add column if not exists reset_token text not null default '';
alter table accounts add column if not exists reset_expires bigint not null default 0;

create table if not exists sessions (
  token text primary key,
  person_id text not null,
  created_at timestamptz not null default now(),
  expires_at bigint not null
);

create table if not exists notifications (
  id text primary key,
  organisation_id text not null references organisations (id),
  recipient_id text not null,
  actor_id text not null default '',
  body text not null default '',
  page text not null default 'dashboard',
  control_id text not null default '',
  ticket_id text not null default '',
  created_at timestamptz not null default now(),
  read_at timestamptz
);

alter table notifications enable row level security;
alter table invitations enable row level security;
alter table acknowledgements enable row level security;
alter table accounts enable row level security;
alter table sessions enable row level security;

create or replace function save_register(payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  org jsonb := payload->'organisation';
  org_id text := coalesce(nullif(org->>'id', ''), 'ORG-001');
begin
  delete from evidence_controls
  where evidence_id in (select id from evidence where organisation_id in (org_id, 'ORG-DS-001'))
     or control_id in (select id from controls where organisation_id in (org_id, 'ORG-DS-001'));
  delete from tickets where control_id in (select id from controls where organisation_id in (org_id, 'ORG-DS-001'));
  delete from decisions where control_id in (select id from controls where organisation_id in (org_id, 'ORG-DS-001'));
  delete from evidence where organisation_id in (org_id, 'ORG-DS-001');
  delete from controls where organisation_id in (org_id, 'ORG-DS-001');
  delete from person_roles where person_id in (select id from people where organisation_id in (org_id, 'ORG-DS-001'));
  delete from acknowledgements where organisation_id in (org_id, 'ORG-DS-001');
  delete from invitations where organisation_id in (org_id, 'ORG-DS-001');
  delete from people where organisation_id in (org_id, 'ORG-DS-001');
  delete from departments where organisation_id in (org_id, 'ORG-DS-001');
  delete from history where organisation_id in (org_id, 'ORG-DS-001');
  delete from notifications where organisation_id in (org_id, 'ORG-DS-001');
  delete from organisations where id = 'ORG-DS-001' and id <> org_id;

  insert into organisations (
    id, name, legal_name, industry, country, locations, framework, reminders,
    website, size, description, contact_name, email_domain, created_at, systems
  ) values (
    org_id,
    coalesce(org->>'name', ''),
    coalesce(org->>'legalName', ''),
    coalesce(org->>'industry', ''),
    coalesce(org->>'country', ''),
    coalesce((select array_agg(value) from jsonb_array_elements_text(coalesce(org->'locations', '[]'::jsonb))), '{}'),
    coalesce(nullif(org->>'framework', ''), 'ISO/IEC 42001'),
    coalesce((org->>'reminders')::boolean, false),
    coalesce(org->>'website', ''),
    coalesce(org->>'size', ''),
    coalesce(org->>'description', ''),
    coalesce(org->>'contactName', ''),
    coalesce(org->>'emailDomain', ''),
    nullif(org->>'createdAt', '')::timestamptz,
    coalesce((select array_agg(value) from jsonb_array_elements_text(coalesce(org->'scope'->'systems', '[]'::jsonb))), '{}')
  )
  on conflict (id) do update set
    name = excluded.name,
    legal_name = excluded.legal_name,
    industry = excluded.industry,
    country = excluded.country,
    locations = excluded.locations,
    framework = excluded.framework,
    reminders = excluded.reminders,
    website = excluded.website,
    size = excluded.size,
    description = excluded.description,
    contact_name = excluded.contact_name,
    email_domain = excluded.email_domain,
    created_at = excluded.created_at,
    systems = excluded.systems;

  insert into departments (id, organisation_id, name, parent_id)
  select d->>'id', org_id, d->>'name', coalesce(d->>'parentId', '')
  from jsonb_array_elements(coalesce(org->'departments', '[]'::jsonb)) d
  where coalesce(d->>'id', '') <> '' and coalesce(d->>'name', '') <> '';

  insert into people (
    id, organisation_id, name, job, title, department_id, email,
    employment_type, manager_id, age_range, drawn_signature, drawn_at
  )
  select
    p->>'id',
    org_id,
    coalesce(p->>'name', ''),
    coalesce(nullif(p->>'role', ''), nullif(p->>'title', ''), 'Staff'),
    coalesce(nullif(p->>'title', ''), nullif(p->>'role', ''), 'Staff'),
    coalesce(
      (select id from departments where organisation_id = org_id and name = nullif(p->>'unit', '') limit 1),
      (select id from departments where organisation_id = org_id order by name limit 1)
    ),
    coalesce(p->>'email', ''),
    case when p->>'employmentType' = 'contractor' then 'contractor' else 'employee' end,
    coalesce(p->>'managerId', ''),
    coalesce(p->>'ageRange', ''),
    coalesce(p->>'drawnSignature', ''),
    nullif(p->>'drawnAt', '')::timestamptz
  from jsonb_array_elements(coalesce(payload->'people', '[]'::jsonb)) p
  where coalesce(p->>'id', '') <> '';

  insert into person_roles (person_id, role)
  select distinct p->>'id', role
  from jsonb_array_elements(coalesce(payload->'people', '[]'::jsonb)) p
  cross join lateral jsonb_array_elements_text(coalesce(p->'roles', '["uploader"]'::jsonb)) role
  where role in ('uploader', 'reviewer', 'admin')
  on conflict do nothing;

  insert into controls (
    id, organisation_id, requirement, expected, frequency, owner_id, reviewer_id,
    template_id, origin, responsibility_version
  )
  select
    c->>'id', org_id, c->>'requirement',
    coalesce(nullif(c->>'expected', ''), 'Supporting document'),
    coalesce(nullif(c->>'frequency', ''), 'Organisation-defined'),
    c->>'ownerId', c->>'reviewerId',
    coalesce(c->>'templateId', ''),
    coalesce(nullif(c->>'origin', ''), 'custom'),
    coalesce((c->>'responsibilityVersion')::integer, 1)
  from jsonb_array_elements(coalesce(payload->'controls', '[]'::jsonb)) c
  where coalesce(c->>'id', '') <> '';

  insert into evidence (
    id, organisation_id, name, version, uploaded_by, uploaded_at, source, hash,
    note, section, has_review, readable, review_due, rejected
  )
  select
    e->>'id', org_id, e->>'name', coalesce((e->>'version')::integer, 1), e->>'uploadedBy',
    coalesce(nullif(e->>'uploadedAt', '')::timestamptz, now()),
    coalesce(nullif(e->>'source', ''), 'Manual upload'),
    coalesce(e->>'hash', ''),
    coalesce(e->>'note', ''),
    coalesce(nullif(e->>'section', ''), 'Uploaded note'),
    coalesce((e->>'hasReview')::boolean, false),
    coalesce((e->>'readable')::boolean, true),
    nullif(e->>'reviewDue', '')::date,
    coalesce((e->>'rejected')::boolean, false)
  from jsonb_array_elements(coalesce(payload->'evidence', '[]'::jsonb)) e
  where coalesce(e->>'id', '') <> '';

  insert into evidence_controls (evidence_id, control_id)
  select e->>'id', cid
  from jsonb_array_elements(coalesce(payload->'evidence', '[]'::jsonb)) e
  cross join lateral jsonb_array_elements_text(coalesce(e->'controlIds', '[]'::jsonb)) cid
  on conflict do nothing;

  insert into decisions (control_id, review, review_by, review_at, comment, reviewed_status)
  select
    d->>'controlId',
    coalesce(nullif(d->>'review', ''), 'awaiting'),
    nullif(d->>'reviewBy', ''),
    nullif(d->>'reviewAt', '')::timestamptz,
    coalesce(d->>'comment', ''),
    nullif(d->>'reviewedStatus', '')
  from jsonb_array_elements(coalesce(payload->'decisions', '[]'::jsonb)) d
  where coalesce(d->>'controlId', '') <> '';

  insert into tickets (
    id, control_id, title, problem, action, owner_id, priority, status, due,
    created_at, fix_evidence_id, submitted_by
  )
  select
    t->>'id', t->>'controlId', coalesce(t->>'title', ''), coalesce(t->>'problem', ''),
    coalesce(t->>'action', ''), t->>'ownerId', coalesce(nullif(t->>'priority', ''), 'Medium'),
    coalesce(nullif(t->>'status', ''), 'assigned'),
    coalesce(nullif(t->>'due', '')::date, current_date),
    coalesce(nullif(t->>'createdAt', '')::timestamptz, now()),
    nullif(t->>'fixEvidenceId', ''),
    nullif(t->>'submittedBy', '')
  from jsonb_array_elements(coalesce(payload->'tickets', '[]'::jsonb)) t
  where coalesce(t->>'id', '') <> '';

  insert into history (organisation_id, occurred_at, actor_id, body)
  select org_id, coalesce(nullif(h->>'at', '')::timestamptz, now()), coalesce(nullif(h->>'actorId', ''), 'system'), coalesce(h->>'text', '')
  from jsonb_array_elements(coalesce(payload->'history', '[]'::jsonb)) h;

  insert into invitations (
    id, organisation_id, name, email, unit, job, profile, age_range, signature_required,
    token, invited_by, invited_at, status, person_id, joined_at
  )
  select
    i->>'id', org_id, coalesce(i->>'name', ''), i->>'email', coalesce(i->>'unit', ''),
    coalesce(i->>'job', ''), coalesce(nullif(i->>'profile', ''), 'uploader'),
    coalesce(i->>'ageRange', ''), coalesce((i->>'signatureRequired')::boolean, false),
    coalesce(i->>'token', ''), coalesce(i->>'invitedBy', ''),
    coalesce(nullif(i->>'invitedAt', '')::timestamptz, now()),
    coalesce(nullif(i->>'status', ''), 'pending'),
    coalesce(i->>'personId', ''),
    nullif(i->>'joinedAt', '')::timestamptz
  from jsonb_array_elements(coalesce(payload->'invitations', '[]'::jsonb)) i
  where coalesce(i->>'id', '') <> '' and coalesce(i->>'email', '') <> '';

  insert into acknowledgements (
    id, organisation_id, person_id, kind, control_id, statement, item_version, status,
    signature, signed_at, user_agent, ip
  )
  select
    a->>'id', org_id, coalesce(a->>'personId', ''), coalesce(nullif(a->>'kind', ''), 'responsibility'),
    coalesce(a->>'controlId', ''), coalesce(a->>'statement', ''),
    coalesce((a->>'itemVersion')::integer, 1), coalesce(nullif(a->>'status', ''), 'required'),
    coalesce(a->>'signature', ''), nullif(a->>'signedAt', '')::timestamptz,
    coalesce(a->>'userAgent', ''), coalesce(a->>'ip', '')
  from jsonb_array_elements(coalesce(payload->'acknowledgements', '[]'::jsonb)) a
  where coalesce(a->>'id', '') <> '';

  insert into notifications (
    id, organisation_id, recipient_id, actor_id, body, page, control_id, ticket_id, created_at, read_at
  )
  select
    n->>'id', org_id, n->>'recipientId', coalesce(n->>'actorId', ''),
    coalesce(n->>'text', ''), coalesce(nullif(n->>'page', ''), 'dashboard'),
    coalesce(n->>'controlId', ''), coalesce(n->>'ticketId', ''),
    coalesce(nullif(n->>'at', '')::timestamptz, now()),
    nullif(n->>'readAt', '')::timestamptz
  from jsonb_array_elements(coalesce(payload->'notifications', '[]'::jsonb)) n
  where coalesce(n->>'id', '') <> '' and coalesce(n->>'recipientId', '') <> '';
end;
$fn$;

create or replace function save_auth(payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  delete from accounts where true;
  delete from sessions where true;
  insert into accounts (email, person_id, salt, password_hash, created_at, reset_token, reset_expires)
  select a->>'email', a->>'personId', a->>'salt', a->>'hash', coalesce(nullif(a->>'createdAt', '')::timestamptz, now()),
    coalesce(a->>'resetToken', ''), coalesce((a->>'resetExpires')::bigint, 0)
  from jsonb_array_elements(coalesce(payload->'accounts', '[]'::jsonb)) a
  where coalesce(a->>'email', '') <> '';
  insert into sessions (token, person_id, created_at, expires_at)
  select s->>'token', s->>'personId', coalesce(nullif(s->>'createdAt', '')::timestamptz, now()), coalesce((s->>'expiresAt')::bigint, 0)
  from jsonb_array_elements(coalesce(payload->'sessions', '[]'::jsonb)) s
  where coalesce(s->>'token', '') <> '';
end;
$fn$;

revoke all on function save_register(jsonb) from public;
revoke all on function save_auth(jsonb) from public;
grant execute on function save_register(jsonb) to service_role;
grant execute on function save_auth(jsonb) to service_role;

notify pgrst, 'reload schema';
