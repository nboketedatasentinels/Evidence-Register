-- What the Data Sentinels super admin dashboard reads, in one round trip.
-- Run once in the Supabase SQL editor, after tenancy.sql.
--
-- It returns counts and onboarding facts per organisation. It does not return
-- evidence, requirements text, history text or anything a client has filed.

create or replace function operator_overview()
returns jsonb
language sql
stable
security definer
set search_path = public
as $fn$
  select jsonb_build_object(
    'organisations', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', o.id,
        'name', o.name,
        'legal_name', o.legal_name,
        'industry', o.industry,
        'country', o.country,
        'created_at', o.created_at,
        'people', (select count(*) from people p where p.organisation_id = o.id),
        'controls', (select count(*) from controls c where c.organisation_id = o.id),
        'evidence', (select count(*) from evidence e where e.organisation_id = o.id),
        'open_tickets', (select count(*) from tickets t where t.organisation_id = o.id and t.status <> 'resolved'),
        'admins', (select count(*) from person_roles r where r.organisation_id = o.id and r.role = 'admin'),
        'last_activity', (select max(h.occurred_at) from history h where h.organisation_id = o.id)
      ) order by o.created_at desc nulls last), '[]')
      from organisations o
    ),
    'admins', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'organisation_id', p.organisation_id,
        'person_id', p.id,
        'name', p.name,
        'email', p.email,
        'has_login', exists (select 1 from accounts a where a.organisation_id = p.organisation_id and a.person_id = p.id),
        'joined_at', (
          select max(i.joined_at) from invitations i
          where i.organisation_id = p.organisation_id and i.person_id = p.id
        )
      )), '[]')
      from people p
      join person_roles r on r.organisation_id = p.organisation_id and r.person_id = p.id and r.role = 'admin'
    ),
    'invitations', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'organisation_id', i.organisation_id,
        'id', i.id,
        'name', i.name,
        'email', i.email,
        'status', i.status,
        'invited_by', i.invited_by,
        'invited_at', i.invited_at,
        'joined_at', i.joined_at
      ) order by i.invited_at desc), '[]')
      from invitations i
      where i.profile = 'admin'
    ),
    'operators', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'email', a.email,
        'created_at', a.created_at
      ) order by a.created_at), '[]')
      from accounts a
      where a.platform_operator
    )
  );
$fn$;

revoke all on function operator_overview() from public;
grant execute on function operator_overview() to service_role;

notify pgrst, 'reload schema';
