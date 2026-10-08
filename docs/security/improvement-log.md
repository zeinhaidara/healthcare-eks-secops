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

### SEC-005: Accepted risk, KMS account-root statement (CKV_AWS_109, CKV_AWS_111, CKV_AWS_356)
- Date / PR: 2026-10-08 / feature/ci-evidence
- Source: Checkov 3.3.26, module.kms aws_iam_policy_document.key
- Risk: none beyond the standard KMS design. The statement delegates key use to IAM; without it the key could become unmanageable. `*` as resource in a key policy means this key only.
- Before: `evidence/security/checkov/after/terraform-hardening/` (4 failed)
- Fix: none possible; suppressed inline with reason, owner and expiry. Register: EXC-001.
- After: `evidence/security/checkov/after/terraform-final/` (0 failed, 4 skipped, same command and version)
- Outcome: accepted risk (EXC-001, expires 2027-04-08)
- Control area: encryption at rest, access control

### SEC-006: Accepted risk, Lambda code signing (CKV_AWS_272)
- Date / PR: 2026-10-08 / feature/ci-evidence
- Source: Checkov 3.3.26, module.secret_rotation aws_lambda_function.this
- Risk: the Lambda zip is not cryptographically signed, so a tampered package would not be rejected at deploy. Mitigated by reviewed source in this repo, packaging by Terraform in the approved apply path, and the apply role being the only deployer.
- Before: `evidence/security/checkov/after/terraform-hardening/`
- Fix: deferred. Add an AWS Signer profile and signing step in Phase 7. Register: EXC-002.
- After: `evidence/security/checkov/after/terraform-final/`
- Outcome: accepted risk (EXC-002, expires 2027-04-08)
- Control area: vulnerability management, change control

### SEC-007: CodeQL added to CI
- Date / PR: 2026-10-08 / feature/sec-tools
- Source: CodeQL (`github/codeql-action` v4.38.3, query suite security-extended), languages python and actions
- Risk: Checkov, Trivy and ruff do not do semantic analysis of Python code or workflow injection paths.
- Before: `evidence/security/codeql/before/` (PENDING: first run on the PR; baseline saved before any fix)
- Fix: `.github/workflows/codeql.yml` (job `codeql`, no paths filter, no AWS access) and `security/codeql/sarif_gate.py`, which fails the job on security-severity 7.0 or more. Terraform is not supported by CodeQL; Checkov covers it. GHAS status: the repo is public, so code scanning upload to the Security tab is available at no cost.
- After: `evidence/security/codeql/after/` (PENDING)
- Outcome: pending baseline
- Control area: vulnerability management, secure SDLC

### SEC-008: SonarCloud added to CI
- Date / PR: 2026-10-08 / feature/sec-tools
- Source: SonarCloud via `SonarSource/sonarqube-scan-action` v8.3.0, quality gate wait enabled
- Risk: no static analysis for bugs, code smells and security hotspots across app and Terraform code.
- Before: `evidence/security/sonar/before/` (PENDING: needs `SONAR_TOKEN`, `SONAR_PROJECT_KEY`, `SONAR_ORGANIZATION` to be set)
- Fix: `.github/workflows/sonar.yml` (job `sonar`), `sonar-project.properties`. The job fails with a clear message if any setting is missing, and fails when the quality gate fails. Coverage is not reported: `pytest-cov` is not a dependency yet.
- After: `evidence/security/sonar/after/` (PENDING)
- Outcome: pending baseline
- Control area: vulnerability management, secure SDLC

### SEC-009: Required approvals set to 0 on `main`
- Date / PR: 2026-10-08 / ruleset change made by the owner by hand
- Source: process control, not a scanner finding
- Risk: a single maintainer cannot approve their own PR, so a required approval would block every merge. With 0 approvals no second person reviews a change.
- Before: ruleset required one approval (blocked all merges by the sole maintainer)
- Fix: approvals set to 0. Compensating controls: required status checks, block force push, restrict deletions, approval-gated deploys. Register: EXC-003.
- After: ruleset settings recorded in `docs/bootstrap.md`
- Outcome: accepted risk (EXC-003, expires 2027-04-08)
- Control area: change control, access control

### SEC-010: Code scanning removed as a ruleset requirement
- Date / PR: 2026-10-08 / ruleset change made by the owner by hand
- Source: process control
- Risk: the ruleset "code scanning results" requirement duplicates, and can disagree with, the CI gate.
- Before: ruleset required code scanning results
- Fix: removed. CodeQL is enforced by the required `codeql` status check, whose job fails on high or critical findings (`security/codeql/sarif_gate.py`).
- After: ruleset settings recorded in `docs/bootstrap.md`
- Outcome: resolved
- Control area: change control
