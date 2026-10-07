# Findings triage process

Owner of all findings: zein (single maintainer). Proposed SLAs, to be confirmed:

| Severity | Triage within | Fix or accept within |
|---|---|---|
| Critical | 1 day | 7 days |
| High | 3 days | 30 days |
| Medium | 14 days | 90 days |
| Low | next phase | best effort |

Process:
1. Save the baseline output under `evidence/security/<tool>/before/` before changing anything.
2. Decide: fix, accept (suppression with reason, owner, expiry, plus a row in `exceptions-register.md`), or defer (with a date).
3. Fix, rerun the same command and tool version, save `after/`, and add an entry to `improvement-log.md` in the same commit.
4. Accepted risks are reviewed at expiry.
