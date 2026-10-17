# Findings triage process

The single maintainer owns all findings. Response times are proposed, not confirmed.

| Severity | Triage within | Fix or accept within |
|---|---|---|
| Critical | 1 day | 7 days |
| High | 3 days | 30 days |
| Medium | 14 days | 90 days |
| Low | best effort | best effort |

1. Save the baseline output under `evidence/security/<tool>/before/` before changing anything.
2. Decide: fix, accept, or defer with a date. An accepted finding needs an inline skip with reason, owner and expiry, plus a row in [exceptions-register.md](exceptions-register.md).
3. Fix, rerun with the same tool version, save `after/`, and add an entry to [improvement-log.md](improvement-log.md) in the same commit.
4. Review accepted risks at expiry.
