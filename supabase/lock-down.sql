-- Close the public API to the register (Sentinel Solver review, 2 Nov 2026; BIF gate A3 and A4).
-- Run once in the Supabase SQL editor of the "Evidence Register" project, after ai-systems.sql.
--
-- Why: every earlier file revoked from PUBLIC and granted to service_role, but Supabase
-- also grants anon and authenticated directly on everything created in public, and
-- revoking from PUBLIC does not remove those grants. The server only ever uses the
-- secret key (service_role), so anon and authenticated need nothing here.
--
-- Safe to run again.

begin;

-- A3: functions. Nobody but the server may call them.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;

-- Run the register functions with the caller's rights rather than the owner's,
-- so a future grant mistake cannot reach past RLS. service_role keeps full access.
alter function load_register(text) security invoker;
alter function save_register(jsonb, bigint) security invoker;
alter function operator_overview() security invoker;
-- rls_auto_enable is Supabase's event trigger that switches RLS on for new tables.
-- It stays, and it still fires; it just can no longer be called through the API.

-- A4: tables and sequences.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- Stop anything created later in public from being exposed again.
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;

commit;

notify pgrst, 'reload schema';
