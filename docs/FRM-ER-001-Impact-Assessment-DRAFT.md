# AI System Impact Assessment — Evidence Register

**Document status:** DRAFT  
**Document ID:** FRM-ER-001 (working draft)  
**System name:** Data Sentinels Evidence Register  
**Short name:** Evidence register  
**Organisation:** Data Sentinels / Transformation Leader (T4L)  
**System owner:** Syntiche Musawu  
**Version:** 0.1 Draft  
**Date created:** 23 September 2026  
**Last updated:** 24 September 2026  

> A demonstration build already exists. This form is the impact assessment for that agent. It was not filed before the first build. That gap is recorded here rather than backdated.

The same draft is shown in the register on Impact. Opening it there does not sign it into the AIMS pack.

## 0. Document control

| Field | Value |
|-------|--------|
| Assessment type | AI system impact assessment |
| Scope | The evidence register used to check a control set against an evidence folder |
| Out of scope | T4L advisory grading, Oil Lab, anomaly detection, Celo, and any tool that writes the missing document |
| Lifecycle stage | Design, with a local demonstration already running |
| Next review | Before the register is used on a live client pack, and after any change to how a verdict is reached |
| Honesty note | Real dates only. This draft starts 23 September 2026. |

## 1. What the system is

A check that compares two inputs:

1. A control set: what the organisation says it does (an ISO pack, a data framework, a finance model policy, or a file they load).
2. An evidence folder: the documents that are supposed to prove it.

It returns four verdicts only: MET, PARTIAL, NOT MET, NO EVIDENCE. It quotes the passage it used, or it says there is nothing to quote. It records the run, including what improved, what regressed, and what is new since the previous run.

A named person confirms or overrides every line. Until they do, the finding is awaiting review.

## 2. What the system is not

- Not a certificate, and not a prediction that an organisation will pass an ISO or other audit.
- Not a replacement for the AIMS coordinator or any other accountable owner. The coordinator reviews what the register says.
- Not a writer of the missing document. A gap may include a prompt the owner takes to their own tool. The register then checks the document they file. It does not produce the document it will later assess.
- Not a ranking of gaps by importance. Default order is the order of the control set. A separate sort can lift controls that other controls depend on.

## 3. Who is affected

| Who | How |
|-----|-----|
| AIMS coordinator | Reviews findings, confirms or overrides, and chases the named owner of a gap |
| Accountable owners | Named on the control set. A gap is theirs to close, not the register's |
| Auditors and clients | May be shown a run record as evidence that a check happened. The record is not itself the audit |
| People named in roles documents | A role change can make an older approval look out of date. That should surface as a regression |

## 4. How evidence may be read

| Mode | What leaves the organisation |
|------|------------------------------|
| This machine | Folder names and dates are read locally. Used in the current build. |
| The organisation's own cloud | One folder, read-only, on infrastructure they already run. Not connected in this build. |
| Hosted by Data Sentinels | A model Data Sentinels operates. Only if the organisation chooses it. Not connected in this build. |

The organisation chooses the mode. The verdict rule does not change with the mode: quote the source, or return NO EVIDENCE.

## 5. Impacts if the check is wrong

| If this happens | Who is harmed | What limits it |
|-----------------|---------------|----------------|
| A missing document is called met | The organisation walks into a review with a false gap closed | A person must confirm. View source shows the passage. No confirmation, no agreed finding. |
| A present document is called missing | Someone rebuilds work that already exists | The owner can override, and the override is stored with their name and the time |
| The register writes the remedy | The checker and the author are the same party | The register does not write documents |
| An old role stays on a document after a promotion | The wrong person is chased, or a control quietly regresses | Change since last run is there to show the regression |

Residual impact of using the demonstration on the T4L grading pack: low for learners, because this agent does not grade learners and does not award points. Residual impact for Data Sentinels' own compliance work: medium, if a confirmed finding is treated as a certificate. The screen states that it is not one.

## 6. Human oversight

The AIMS coordinator, or the named reviewer on the run, is accountable for agreeing a finding. Suggested owners come from the control set, so a gap for an impact assessment sits with the person who owns impact assessments, not with whoever happens to be looking at the screen.

## 7. Open points

- This form is a draft and is not in the signed AIMS pack.
- No accuracy trial across models is filed with this draft.
- Cloud and hosted modes are described and not built.
- The T4L grading pack loaded in the demonstration uses the September 2026 working drafts. Several of those are partial or have no evidence. That is the current picture, not a target score.
