-- Multitenancy for the Evidence Register.
--
-- Run once in the Supabase SQL editor, after register.sql. Back up first.
--
-- Every register row is keyed by (organisation_id, id), so two organisations
-- can both have CTRL-0001, EV-000001 or a person called "jane". The register
-- is read and written one organisation at a time, and organisations.version
-- stops a stale copy from overwriting a newer one.

begin;

-- 1. Organisation columns on the tables that only reached it through a parent.

alter table organisations add column if not exists version bigint not null default 0;

alter table person_roles add column if not exists organisation_id text;
alter table evidence_controls add column if not exists organisation_id text;
alter table decisions add column if not exists organisation_id text;
alter table tickets add column if not exists organisation_id text;

update person_roles r set organisation_id = p.organisation_id
from people p where r.person_id = p.id and r.organisation_id is null;
update evidence_controls l set organisation_id = e.organisation_id
from evidence e where l.evidence_id = e.id and l.organisation_id is null;
update decisions d set organisation_id = c.organisation_id
from controls c where d.control_id = c.id and d.organisation_id is null;
update tickets t set organisation_id = c.organisation_id
from controls c where t.control_id = c.id and t.organisation_id is null;

alter table person_roles alter column organisation_id set not null;
alter table evidence_controls alter column organisation_id set not null;
alter table decisions alter column organisation_id set not null;
alter table tickets alter column organisation_id set not null;

-- 2. Accounts and sessions know their organisation. Platform operators have none.

alter table accounts add column if not exists organisation_id text;
alter table accounts add column if not exists platform_operator boolean not null default false;
alter table accounts alter column person_id drop not null;
update accounts a set organisation_id = p.organisation_id
from people p where a.person_id = p.id and a.organisation_id is null;

alter table sessions add column if not exists organisation_id text;
alter table sessions add column if not exists email text not null default '';
alter table sessions alter column person_id drop not null;
update sessions s set organisation_id = p.organisation_id
from people p where s.person_id = p.id and s.organisation_id is null;
update sessions s set email = a.email
from accounts a where s.person_id = a.person_id and s.email = '';

-- 3. Drop the single-column keys and every foreign key that used them.

do $$
declare
  rekeyed text[] := array[
    'departments', 'people', 'person_roles', 'controls', 'evidence', 'evidence_controls',
    'decisions', 'tickets', 'history', 'invitations', 'acknowledgements', 'notifications'
  ];
  r record;
begin
  for r in
    select conrelid::regclass::text as tbl, conname
    from pg_constraint
    where contype = 'f'
      and (conrelid::regclass::text = any (rekeyed) or confrelid::regclass::text = any (rekeyed))
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;

  for r in
    select conrelid::regclass::text as tbl, conname
    from pg_constraint
    where contype = 'p'
      and conrelid::regclass::text = any (rekeyed)
      and conrelid::regclass::text <> 'history'
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end
$$;

-- 4. Organisation-scoped keys.

alter table departments add primary key (organisation_id, id);
alter table people add primary key (organisation_id, id);
alter table person_roles add primary key (organisation_id, person_id, role);
alter table controls add primary key (organisation_id, id);
alter table evidence add primary key (organisation_id, id);
alter table evidence_controls add primary key (organisation_id, evidence_id, control_id);
alter table decisions add primary key (organisation_id, control_id);
alter table tickets add primary key (organisation_id, id);
alter table invitations add primary key (organisation_id, id);
alter table acknowledgements add primary key (organisation_id, id);
alter table notifications add primary key (organisation_id, id);

alter table departments add foreign key (organisation_id) references organisations (id);
alter table people add foreign key (organisation_id) references organisations (id);
alter table people add foreign key (organisation_id, department_id) references departments (organisation_id, id);
alter table person_roles add foreign key (organisation_id, person_id) references people (organisation_id, id);
alter table controls add foreign key (organisation_id) references organisations (id);
alter table controls add foreign key (organisation_id, owner_id) references people (organisation_id, id);
alter table controls add foreign key (organisation_id, reviewer_id) references people (organisation_id, id);
alter table evidence add foreign key (organisation_id) references organisations (id);
alter table evidence add foreign key (organisation_id, uploaded_by) references people (organisation_id, id);
alter table evidence_controls add foreign key (organisation_id, evidence_id) references evidence (organisation_id, id);
alter table evidence_controls add foreign key (organisation_id, control_id) references controls (organisation_id, id);
alter table decisions add foreign key (organisation_id, control_id) references controls (organisation_id, id);
alter table decisions add foreign key (organisation_id, review_by) references people (organisation_id, id);
alter table tickets add foreign key (organisation_id, control_id) references controls (organisation_id, id);
alter table tickets add foreign key (organisation_id, owner_id) references people (organisation_id, id);
alter table tickets add foreign key (organisation_id, submitted_by) references people (organisation_id, id);
alter table tickets add foreign key (organisation_id, fix_evidence_id) references evidence (organisation_id, id);
alter table history add foreign key (organisation_id) references organisations (id);
alter table invitations add foreign key (organisation_id) references organisations (id);
alter table acknowledgements add foreign key (organisation_id) references organisations (id);
alter table notifications add foreign key (organisation_id) references organisations (id);

create index if not exists history_organisation_idx on history (organisation_id, occurred_at);
create index if not exists notifications_recipient_idx on notifications (organisation_id, recipient_id);
create unique index if not exists invitations_token_idx on invitations (token) where token <> '';
create index if not exists invitations_email_idx on invitations (email);
create index if not exists accounts_reset_idx on accounts (reset_token) where reset_token <> '';
create index if not exists sessions_expiry_idx on sessions (expires_at);
create index if not exists sessions_person_idx on sessions (organisation_id, person_id);

-- 5. Read one organisation in one round trip.

create or replace function load_register(org_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $fn$
  select jsonb_build_object(
    'organisations', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from organisations t where t.id = org_id),
    'departments', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from departments t where t.organisation_id = org_id),
    'people', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from people t where t.organisation_id = org_id),
    'person_roles', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from person_roles t where t.organisation_id = org_id),
    'controls', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from controls t where t.organisation_id = org_id),
    'evidence', (select coalesce(jsonb_agg(to_jsonb(t) order by t.uploaded_at desc), '[]') from evidence t where t.organisation_id = org_id),
    'evidence_controls', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from evidence_controls t where t.organisation_id = org_id),
    'decisions', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from decisions t where t.organisation_id = org_id),
    'tickets', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]') from tickets t where t.organisation_id = org_id),
    'history', (select coalesce(jsonb_agg(to_jsonb(t) order by t.occurred_at, t.id), '[]') from history t where t.organisation_id = org_id),
    'invitations', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from invitations t where t.organisation_id = org_id),
    'acknowledgements', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from acknowledgements t where t.organisation_id = org_id),
    'notifications', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from notifications t where t.organisation_id = org_id)
  );
$fn$;

-- 6. Write one organisation. expected_version null creates a new organisation.
--    A version that no longer matches raises register_conflict and saves nothing.

drop function if exists save_register(jsonb);

create or replace function save_register(payload jsonb, expected_version bigint)
returns bigint
language plpgsql
security definer
set search_path = public
as $fn$
declare
  org jsonb := payload->'organisation';
  org_id text := nullif(org->>'id', '');
  next_version bigint;
begin
  if org_id is null then
    raise exception 'register_missing_organisation';
  end if;

  if expected_version is null then
    insert into organisations (id, name, legal_name, industry, country, locations, framework, reminders, version, created_at)
    values (
      org_id, coalesce(org->>'name', ''), coalesce(org->>'legalName', ''), coalesce(org->>'industry', ''),
      coalesce(org->>'country', ''), '{}', 'ISO/IEC 42001', false, 1, now()
    )
    on conflict (id) do nothing;
    if not found then
      raise exception 'register_conflict';
    end if;
    next_version := 1;
  else
    update organisations set version = version + 1
    where id = org_id and version = expected_version
    returning version into next_version;
    if next_version is null then
      raise exception 'register_conflict';
    end if;
  end if;

  delete from evidence_controls where organisation_id = org_id;
  delete from tickets where organisation_id = org_id;
  delete from decisions where organisation_id = org_id;
  delete from evidence where organisation_id = org_id;
  delete from controls where organisation_id = org_id;
  delete from person_roles where organisation_id = org_id;
  delete from acknowledgements where organisation_id = org_id;
  delete from invitations where organisation_id = org_id;
  delete from people where organisation_id = org_id;
  delete from departments where organisation_id = org_id;
  delete from history where organisation_id = org_id;
  delete from notifications where organisation_id = org_id;

  update organisations set
    name = coalesce(org->>'name', ''),
    legal_name = coalesce(org->>'legalName', ''),
    industry = coalesce(org->>'industry', ''),
    country = coalesce(org->>'country', ''),
    locations = coalesce((select array_agg(value) from jsonb_array_elements_text(coalesce(org->'locations', '[]'::jsonb))), '{}'),
    framework = coalesce(nullif(org->>'framework', ''), 'ISO/IEC 42001'),
    reminders = coalesce((org->>'reminders')::boolean, false),
    website = coalesce(org->>'website', ''),
    size = coalesce(org->>'size', ''),
    description = coalesce(org->>'description', ''),
    contact_name = coalesce(org->>'contactName', ''),
    email_domain = coalesce(org->>'emailDomain', ''),
    created_at = coalesce(nullif(org->>'createdAt', '')::timestamptz, created_at),
    systems = coalesce((select array_agg(value) from jsonb_array_elements_text(coalesce(org->'scope'->'systems', '[]'::jsonb))), '{}')
  where id = org_id;

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

  insert into person_roles (organisation_id, person_id, role)
  select distinct org_id, p->>'id', role
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
    id, organisation_id, name, version, uploaded_by, uploaded_at, source, location, hash,
    note, section, has_review, readable, review_due, rejected
  )
  select
    e->>'id', org_id, e->>'name', coalesce((e->>'version')::integer, 1), e->>'uploadedBy',
    coalesce(nullif(e->>'uploadedAt', '')::timestamptz, now()),
    coalesce(nullif(e->>'source', ''), 'Manual upload'),
    coalesce(e->>'location', ''),
    coalesce(e->>'hash', ''),
    coalesce(e->>'note', ''),
    coalesce(nullif(e->>'section', ''), 'Uploaded note'),
    coalesce((e->>'hasReview')::boolean, false),
    coalesce((e->>'readable')::boolean, true),
    nullif(e->>'reviewDue', '')::date,
    coalesce((e->>'rejected')::boolean, false)
  from jsonb_array_elements(coalesce(payload->'evidence', '[]'::jsonb)) e
  where coalesce(e->>'id', '') <> '';

  insert into evidence_controls (organisation_id, evidence_id, control_id)
  select org_id, e->>'id', cid
  from jsonb_array_elements(coalesce(payload->'evidence', '[]'::jsonb)) e
  cross join lateral jsonb_array_elements_text(coalesce(e->'controlIds', '[]'::jsonb)) cid
  on conflict do nothing;

  insert into decisions (organisation_id, control_id, review, review_by, review_at, comment, reviewed_status)
  select
    org_id,
    d->>'controlId',
    coalesce(nullif(d->>'review', ''), 'awaiting'),
    nullif(d->>'reviewBy', ''),
    nullif(d->>'reviewAt', '')::timestamptz,
    coalesce(d->>'comment', ''),
    nullif(d->>'reviewedStatus', '')
  from jsonb_array_elements(coalesce(payload->'decisions', '[]'::jsonb)) d
  where coalesce(d->>'controlId', '') <> '';

  insert into tickets (
    organisation_id, id, control_id, title, problem, action, owner_id, priority, status, due,
    created_at, fix_evidence_id, submitted_by
  )
  select
    org_id, t->>'id', t->>'controlId', coalesce(t->>'title', ''), coalesce(t->>'problem', ''),
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

  return next_version;
end;
$fn$;

-- 7. Accounts and sessions are written one row at a time from now on.

drop function if exists save_auth(jsonb);

revoke all on function load_register(text) from public;
revoke all on function save_register(jsonb, bigint) from public;
grant execute on function load_register(text) to service_role;
grant execute on function save_register(jsonb, bigint) to service_role;

commit;

notify pgrst, 'reload schema';
