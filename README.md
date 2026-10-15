# Compliance Agent

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

- **Data Sentinels (super admin)** signs in at `/operator`, opens an organisation for each client, and invites its admins. The dashboard shows each organisation's admins, resends admin invitations, and adds more admins.
- **Each organisation's admins** invite their own users and reviewers and set their own requirements. They see only their organisation.
- **Nobody signs up without an invitation.** `/admin`, `/reviewer` and `/user` only sign in or accept an invitation link. One email belongs to one organisation.

Create a super admin account:

```bash
npm run operator -- name@data-sentinels.com
```

## Database

Run these in the Supabase SQL editor, in order, once each: `supabase/register.sql`, then `supabase/tenancy.sql`, then `supabase/operator.sql`, then `supabase/reviews.sql`. Do not run `register.sql` again after `tenancy.sql`, because it would bring back the old single-organisation save.

The T4L grading AIMS pack is loaded as the worked example. A control file can replace it. One row per line:

```text
REF | CONTROL | ARTEFACT | MONTHS | OWNER | ROLE | FEEDS
```
