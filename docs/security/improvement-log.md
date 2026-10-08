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

### SEC-001: Pin availability zones explicitly (CKV_AWS_394)
- Date / PR: 2026-10-08 / feature/ci-evidence
- Source: Checkov 3.3.26, CKV_AWS_394, module.network aws_availability_zones data source
- Risk: a data source that discovers zones can change its result set between runs, so subnets could be planned into different AZs without a code change.
- Before: `evidence/security/checkov/before/terraform/` (command in `summary.txt`)
- Fix: removed the data source; the root passes explicit AZ names built from the region and `az_suffixes` (default a, b). Files: `terraform/main.tf`, `terraform/variables.tf`, `terraform/modules/network/*`
- After: `evidence/security/checkov/after/terraform/`, same command and version
- Outcome: resolved
- Control area: change control, availability

## Open findings awaiting owner decision (no suppression added without approval)

Baseline: 6 failed, after SEC-001: 5 failed. See `evidence/security/checkov/after/terraform/summary.txt`.

| Rule | Resource | Note |
|---|---|---|
| CKV_AWS_109, CKV_AWS_356, CKV_AWS_111 | KMS key policy | The account-root statement with `kms:*` is required in every KMS key policy; `*` as resource means this key only. Proposed: skip with reason. |
| CKV_AWS_338 | VPC flow log group | Rule wants 1 year retention; design fixes 30 days (cost). Proposed: skip with reason, or raise retention. |
| CKV2_AWS_57 | API key secret | Rotation needs a rotation Lambda; the key is set by hand. Proposed: skip with reason, rotate manually. |
| CKV_GHA_7 | `terraform-apply.yml` | Rule forbids `workflow_dispatch` inputs; the design needs `action` and `confirm`. Proposed: skip with reason. |
