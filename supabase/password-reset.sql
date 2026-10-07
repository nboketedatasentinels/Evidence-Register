alter table accounts add column if not exists reset_token text not null default '';
alter table accounts add column if not exists reset_expires bigint not null default 0;

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

revoke all on function save_auth(jsonb) from public;
grant execute on function save_auth(jsonb) to service_role;

notify pgrst, 'reload schema';
