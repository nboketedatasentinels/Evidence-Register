-- The original decisions table only allowed awaiting, confirmed and overridden.
-- Reject saves "rejected" and Request more evidence saves "requested", so the
-- database refused both. Run once in the Supabase SQL editor.

alter table decisions drop constraint if exists decisions_review_check;
alter table decisions add constraint decisions_review_check
  check (review in ('awaiting', 'confirmed', 'overridden', 'rejected', 'requested'));

-- Lists every other rule of this kind, so any similar limit can be checked.
select conrelid::regclass as table_name, conname as rule, pg_get_constraintdef(oid) as allows
from pg_constraint
where contype = 'c' and connamespace = 'public'::regnamespace
order by 1, 2;
