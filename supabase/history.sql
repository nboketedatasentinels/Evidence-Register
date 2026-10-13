-- History that cannot be edited.
--
-- Run once in the Supabase SQL editor, after reviews.sql and decisions.sql.
-- 1. Each history row gets a fingerprint that chains to the row before it in
--    the same organisation, so a changed or missing row breaks the chain.
-- 2. The database refuses any update, delete or truncate on history.
-- 3. save_register stops rewriting history and only adds new entries.

begin;

alter table history add column if not exists prev_hash text not null default '';
alter table history add column if not exists row_hash text not null default '';

create or replace function history_chain()
returns trigger
language plpgsql
set search_path = public
as $fn$
declare
  previous text;
begin
  select row_hash into previous
  from history
  where organisation_id = new.organisation_id
  order by occurred_at desc, id desc
  limit 1;
  new.prev_hash := coalesce(previous, '');
  new.row_hash := encode(sha256(convert_to(
    concat_ws('|', new.prev_hash, new.organisation_id, to_char(new.occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'), new.actor_id, new.body),
    'UTF8'
  )), 'hex');
  return new;
end;
$fn$;

-- Fingerprint the rows already stored, oldest first, before the lock goes on.
do $fn$
declare
  r record;
  previous text := '';
  last_org text := '';
begin
  for r in select id, organisation_id, occurred_at, actor_id, body from history order by organisation_id, occurred_at, id loop
    if r.organisation_id <> last_org then
      previous := '';
      last_org := r.organisation_id;
    end if;
    update history set
      prev_hash = previous,
      row_hash = encode(sha256(convert_to(
        concat_ws('|', previous, r.organisation_id, to_char(r.occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'), r.actor_id, r.body),
        'UTF8'
      )), 'hex')
    where id = r.id
    returning row_hash into previous;
  end loop;
end;
$fn$;

create or replace function history_is_append_only()
returns trigger
language plpgsql
as $fn$
begin
  raise exception 'history_is_append_only: history rows cannot be changed or removed';
end;
$fn$;

drop trigger if exists history_chain on history;
create trigger history_chain before insert on history
  for each row execute function history_chain();

drop trigger if exists history_no_update on history;
create trigger history_no_update before update or delete on history
  for each row execute function history_is_append_only();

drop trigger if exists history_no_truncate on history;
create trigger history_no_truncate before truncate on history
  for each statement execute function history_is_append_only();

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
      coalesce(org->>'country', ''), '{}', 'Internal policy', false, 1, now()
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
  delete from notifications where organisation_id = org_id;

  update organisations set
    name = coalesce(org->>'name', ''),
    legal_name = coalesce(org->>'legalName', ''),
    industry = coalesce(org->>'industry', ''),
    country = coalesce(org->>'country', ''),
    locations = coalesce((select array_agg(value) from jsonb_array_elements_text(coalesce(org->'locations', '[]'::jsonb))), '{}'),
    framework = coalesce(nullif(org->>'framework', ''), 'Internal policy'),
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

  -- History is only ever added to. Rows already stored are left alone, and
  -- only entries newer than the last stored one are written.
  insert into history (organisation_id, occurred_at, actor_id, body)
  select org_id, coalesce(nullif(h->>'at', '')::timestamptz, now()), coalesce(nullif(h->>'actorId', ''), 'system'), coalesce(h->>'text', '')
  from jsonb_array_elements(coalesce(payload->'history', '[]'::jsonb)) with ordinality as entry(h, n)
  where coalesce(nullif(h->>'at', '')::timestamptz, now()) > coalesce(
    (select max(occurred_at) from history where organisation_id = org_id),
    '-infinity'::timestamptz
  )
  order by n;

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

revoke all on function save_register(jsonb, bigint) from public;
grant execute on function save_register(jsonb, bigint) to service_role;

commit;

notify pgrst, 'reload schema';
