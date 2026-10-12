# Evidence Register

A pre-audit check for Data Sentinels. Load a control set, point at an evidence folder, and read which lines are met, partial, not met, or have no evidence.

A named reviewer confirms or overrides every finding. The register does not write the missing document, and it does not certify the organisation.

The impact assessment for this agent is `docs/FRM-ER-001-Impact-Assessment-DRAFT.md`.

## Run

```bash
npm install
npm start
```

Open http://localhost:3000.

## Organisations

The register holds many organisations in one Supabase project. Every row carries `organisation_id`, and the server takes the organisation from the signed-in session, never from the request.

- **Self-serve:** opening `/admin` without an invitation starts a new organisation, with that person as its first admin.
- **Platform operator:** Data Sentinels staff sign in at `/operator` to list organisations and open one for a client. The client's first admin gets an invitation email.
- **Everyone else** joins through an invitation from their organisation's admin. One email belongs to one organisation.

Create an operator account:

```bash
npm run operator -- name@data-sentinels.com
```

## Database

Run these in the Supabase SQL editor, in order, once each: `supabase/register.sql`, then `supabase/tenancy.sql`. Do not run `register.sql` again after `tenancy.sql`, because it would bring back the old single-organisation save.

The T4L grading AIMS pack is loaded as the worked example. A control file can replace it. One row per line:

```text
REF | CONTROL | ARTEFACT | MONTHS | OWNER | ROLE | FEEDS
```
