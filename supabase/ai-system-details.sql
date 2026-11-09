-- AI System Register details that a real inventory asks for: how the system
-- came about (built in-house, built on a third-party model, or bought), the
-- provider and model, its stage, who makes the final decision, whether it uses
-- personal data, and where that data is processed. Run after ai-systems.sql.
-- Until this runs, the register keeps working and saves the original fields.
begin;

alter table ai_systems add column if not exists source text not null default ''
  check (source in ('', 'in-house', 'third-party-model', 'bought'));
alter table ai_systems add column if not exists provider text not null default '';
alter table ai_systems add column if not exists stage text not null default ''
  check (stage in ('', 'planned', 'building', 'testing', 'live', 'retired'));
alter table ai_systems add column if not exists oversight text not null default ''
  check (oversight in ('', 'person-decides', 'person-samples', 'automated'));
alter table ai_systems add column if not exists personal_data text not null default ''
  check (personal_data in ('', 'yes', 'no', 'unsure'));
alter table ai_systems add column if not exists countries text not null default '';

commit;
