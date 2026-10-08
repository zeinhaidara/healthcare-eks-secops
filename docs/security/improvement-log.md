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

### SEC-002: Keep flow logs for 365 days (CKV_AWS_338)
- Date / PR: 2026-10-08 / feature/ci-evidence
- Source: Checkov 3.3.26, CKV_AWS_338, module.network aws_cloudwatch_log_group.flow
- Risk: 30 days of network flow history is too short to investigate an incident found late.
- Before: `evidence/security/checkov/before/ci-run-failures-2026-10-08.txt` (CI run 37780950499) and `before/terraform/`
- Fix: `log_retention_days` default 365 in `terraform/variables.tf`; the rotation Lambda log group uses the same value. Cost impact is small at this log volume.
- After: `evidence/security/checkov/after/terraform-hardening/` (same command, `security/checkov/terraform.yaml`)
- Outcome: resolved
- Control area: audit logging

### SEC-003: Rotate the API key every 30 days (CKV2_AWS_57)
- Date / PR: 2026-10-08 / feature/ci-evidence
- Source: Checkov 3.3.26, CKV2_AWS_57, module.secrets aws_secretsmanager_secret.this
- Risk: a static API key that never changes stays valid forever if it leaks.
- Before: same evidence as SEC-002
- Fix: new module `terraform/modules/secret-rotation` (Python 3.12 Lambda with the four rotation steps, value from `secrets.token_urlsafe`, never logged) and `aws_secretsmanager_secret_rotation` in `modules/secrets` with a 30-day schedule. Lambda hardening: VPC private subnets with a dedicated egress-443-only security group, KMS-encrypted SQS dead-letter queue, X-Ray, reserved concurrency 1, KMS-encrypted environment, KMS-encrypted 365-day log group. Role limited to the one secret ARN and the project key; ENI create/delete limited to its own subnets. Runbook: `docs/runbooks/rotation.md`.
- After: `evidence/security/checkov/after/terraform-hardening/`
- Outcome: resolved. Residual: the app reads the key only at startup, so pods must restart after a rotation (runbook).
- Control area: secrets management, access control

### SEC-004: Remove workflow_dispatch inputs (CKV_GHA_7)
- Date / PR: 2026-10-08 / feature/ci-evidence
- Source: Checkov 3.3.26, CKV_GHA_7, `terraform-apply.yml`
- Risk: user-supplied inputs can change what a build or deploy does.
- Before: `evidence/security/checkov/before/ci-run-failures-2026-10-08.txt` (CI run 37780950496)
- Fix: no inputs anywhere. `terraform-apply.yml`: `tf-plan` (plan role) then `tf-apply` (environment `infra`, applies that exact plan file). New `terraform-destroy.yml` behind the `infra-destroy` environment; the approval replaces the typed confirmation. The plan job now uses the read-only plan role.
- After: `evidence/security/checkov/after/app-workflows/` (Dockerfile 48 passed, workflows 220 passed, 0 failed)
- Outcome: resolved
- Control area: change control, least privilege

## Open findings awaiting owner approval (no suppression added)

After SEC-001 to SEC-004: 4 failed, 112 passed. See `evidence/security/checkov/after/terraform-hardening/summary.txt`.

| Rule | Resource | Proposed handling |
|---|---|---|
| CKV_AWS_109, CKV_AWS_356, CKV_AWS_111 | KMS key policy | Skip. The account-root `kms:*` statement is required in every key policy; `*` as resource means this key only. |
| CKV_AWS_272 | Rotation Lambda | Cannot be satisfied without an AWS Signer signing profile plus a signing job that signs the zip before deploy; unsigned code would be rejected under enforce mode. Options: skip with expiry, or add Signer in a later phase. |
