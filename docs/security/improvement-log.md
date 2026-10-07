# Security improvement log

One entry per security change. Evidence lives under `evidence/security/`. Never edit a baseline after the fact.
Controls are described as HIPAA-aligned, never HIPAA compliant.

## Entry template

```
### SEC-NNN: <short title>
- Date / PR:
- Source: <tool, version, rule ID, severity, resource>
- Risk: <one or two plain sentences>
- Before: <evidence path and the command that produced it>
- Fix: <what changed, files, commit>
- After: <evidence path, same command>
- Outcome: resolved | accepted risk (link to exceptions-register) | deferred
- Control area: <encryption at rest, encryption in transit, access control, audit logging, vulnerability management, ...>
```

## Entries

### SEC-000: Baseline scans of the application (no findings)
- Date / PR: 2026-10-07 / feature/ci-evidence
- Source: Trivy v0.75.0 (vuln, secret; HIGH and CRITICAL; unfixed ignored); Checkov 3.3.26 (dockerfile, github_actions)
- Risk: none found. Recorded so later scans have a reference point and the scan scope is on record.
- Before: `evidence/security/trivy/before/` and `evidence/security/checkov/before/` (commands are in each `summary.txt`)
- Fix: none needed
- After: not applicable
- Outcome: resolved (nothing to fix)
- Control area: vulnerability management
