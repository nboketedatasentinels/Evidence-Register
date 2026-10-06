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

The T4L grading AIMS pack is loaded as the worked example. A control file can replace it. One row per line:

```text
REF | CONTROL | ARTEFACT | MONTHS | OWNER | ROLE | FEEDS
```
