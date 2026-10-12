-- Reviewer decisions as their own records.
--
-- Run once in the Supabase SQL editor, after tenancy.sql and operator.sql.
-- Every accept, reject, edit, request for more evidence, and fix verification
-- becomes one row. Rows are only added: the register never rewrites them.

begin;

create table if not exists reviews (
  organisation_id text not null references organisations (id),
  id text not null,
  control_id text not null default '',
  evidence_id text not null default '',
  evidence_name text not null default '',
  evidence_version integer not null default 0,
  filer_id text not null default '',
  reviewer_id text not null default '',
  decision text not null,
  status text not null default '',
  comment text not null default '',
  ticket_id text not null default '',
  decided_at timestamptz not null default now(),
  primary key (organisation_id, id)
);

create index if not exists reviews_decided_idx on reviews (organisation_id, decided_at);

alter table reviews enable row level security;

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
    'notifications', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from notifications t where t.organisation_id = org_id),
    'reviews', (select coalesce(jsonb_agg(to_jsonb(t) order by t.decided_at, t.id), '[]') from reviews t where t.organisation_id = org_id)
  );
$fn$;

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

  -- Review decisions are only ever added. Nothing above deletes them.
  insert into reviews (
    organisation_id, id, control_id, evidence_id, evidence_name, evidence_version, filer_id,
    reviewer_id, decision, status, comment, ticket_id, decided_at
  )
  select
    org_id, r->>'id', coalesce(r->>'controlId', ''), coalesce(r->>'evidenceId', ''),
    coalesce(r->>'evidenceName', ''), coalesce((r->>'evidenceVersion')::integer, 0),
    coalesce(r->>'filerId', ''), coalesce(r->>'reviewerId', ''), r->>'decision',
    coalesce(r->>'status', ''), coalesce(r->>'comment', ''), coalesce(r->>'ticketId', ''),
    coalesce(nullif(r->>'at', '')::timestamptz, now())
  from jsonb_array_elements(coalesce(payload->'newReviews', '[]'::jsonb)) r
  where coalesce(r->>'id', '') <> '' and coalesce(r->>'decision', '') <> ''
  on conflict do nothing;

  return next_version;
end;
$fn$;


revoke all on function load_register(text) from public;
revoke all on function save_register(jsonb, bigint) from public;
grant execute on function load_register(text) to service_role;
grant execute on function save_register(jsonb, bigint) to service_role;

commit;

notify pgrst, 'reload schema';
