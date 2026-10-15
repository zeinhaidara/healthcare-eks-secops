# Phase map

The project was built in numbered phases, and older docs and code comments still use the numbers. This page maps each number to what the tracked repo records about it. Docs and file names use topic names; phase numbers appear only here and in historical text.

**Sources used:** tracked docs, code comments and git history. The original design plan is kept locally and is **not in the repo**, so it is not a source here. Anything the tracked sources do not say is marked "not recorded in tracked docs". Nothing on this page is inferred beyond the notes in the SEC column.

## Phases

| Phase | Topic | Delivered, as recorded in tracked sources | Status | SEC IDs |
|---|---|---|---|---|
| 1 | App foundation | The FastAPI app, DynamoDB store, frontend, Dockerfile and pull-request checks (commits `0f86fa9`, `cfb5492`). CI scanners added: SEC-007, SEC-008 and SEC-011 to SEC-015. Baseline scans: SEC-000. | Recorded as delivered | SEC-000, SEC-007, SEC-008, SEC-011 to SEC-015 |
| 2 | Terraform foundation | Network, KMS, ECR, secrets with rotation, DynamoDB, budget, apply and destroy workflows. Named in `docs/bootstrap-policies/README.md:29-30` ("New in Phase 2 (table, rotation Lambda and its dead-letter queue)"), `docs/cost/budget.md:3` and `docs/security/exceptions-register.md:8`. | Recorded as delivered | SEC-001 to SEC-006, SEC-016, SEC-020 |
| 3 | EKS on Fargate | The EKS module, add-ons, access entries and ACM. Named in `docs/bootstrap.md:45`, `docs/bootstrap-policies/README.md:49`, `docs/security/findings-report.md:14` and `docs/security/improvement-log.md:294`. | Recorded as delivered | SEC-017 to SEC-019, SEC-021 to SEC-029 |
| 4 | Helm chart and release pipeline | The chart, `cd.yml`, the smoke test and the deploy check. Named in `docs/bootstrap.md:59`, `docs/bootstrap-policies/README.md:72`, `docs/runbooks/gitops-deploy.md` (the deploy check, merged there) and `docs/security/improvement-log.md:326,363`. A manual rollback script and runbook are **not present** (`docs/security/controls.md`, section 5). | Recorded as delivered, except the manual rollback script and its runbook | SEC-030 to SEC-034 |
| 5 | not recorded in tracked docs | **Not recorded in tracked docs.** There is no entry, branch, SEC ID or doc that describes its scope or what it delivered. Tracked sources only use the label: "Phase 5 security services" (`docs/bootstrap-policies/README.md:44`), "Prune the list after Phase 5" (`docs/bootstrap-policies/README.md:46`) and "end of Phase 5 (security services)" (`docs/cost/budget.md:64`). | Not recorded | none |
| 6 | not recorded in tracked docs | **Not recorded in tracked docs.** There is no entry, branch, SEC ID or doc that describes its scope or what it delivered. Tracked sources only use the label for alerting: "alert routing is Phase 6" (`docs/security/improvement-log.md:421`), "the Phase 6 alarms" (`docs/security/improvement-log.md:422`), "alerts are wired in Phase 6" (`terraform/modules/detective/main.tf:209`) and "Phase 6 wires alerts" (`docs/runbooks/detective-controls.md:79`). Terraform has no alarm resource and no SNS subscription (searched 2026-10-12). | Not recorded | none |
| 7 | Detective controls, posture scan and policy tightening | Step 1, detective controls: Security Hub, GuardDuty and a single-region CloudTrail (`terraform/main.tf:194`, `docs/security/improvement-log.md:402`, branch `feature/phase7-detective`). "Phase 7 (posture scan and triage)" is named at `docs/bootstrap-policies/README.md:36`; the scan and its triage are in `docs/security/prowler-triage.md`. Policy tightening tasks are named "Phase 7" at `docs/bootstrap-policies/README.md:36,38,62,81,87`. Inspector, Config and WAF are not built (`docs/security/controls.md`, section 7). | Detective controls and the scan: recorded as delivered. Tightening tasks: open. | SEC-035 to SEC-037 |
| 8 | Wrap-up: cost, report, presentation | The README, runbooks, `docs/security/talk/presentation-facts.md` (titled "Phase 8"), and the budget scope (SEC-038). The findings report was meant to be completed in Phase 8 and is not (`docs/security/findings-report.md:3`). The measured cost baseline is not recorded (`docs/cost/budget.md:49` still says "Replace with measured values in the Phase 8 cost baseline"). An incident simulation is not recorded (`docs/security/controls.md`, section 7). | Partly recorded | SEC-038 |

## Entries with no phase

| SEC IDs | What | Note |
|---|---|---|
| SEC-009, SEC-010 | Repository ruleset changes made by hand | Process controls, not tied to a phase in the log |
| SEC-039, SEC-040 | The v2 and v2.1 patient app | Built after the phases above; the tracked docs do not assign them a phase |

## How the SEC column was built
The improvement log has no phase field. The SEC IDs above are grouped by the branch name and date in each entry's "Date / PR" line, so the grouping is **not verified** as an author's statement. Check any grouping before relying on it. The phase labels inside SEC entries (for example "Phase 4 build" at `docs/security/improvement-log.md:326`) are the only places the log itself names a phase.

## To fill in (owner)
- **Phase 5:** what was planned, whether any of it was built, and under which branch or SEC ID. Fill in: ____
- **Phase 6:** what was planned, whether any of it was built, and under which branch or SEC ID. Fill in: ____
- Whether the phase numbers on this page match the numbering in the original design plan. Fill in: ____
