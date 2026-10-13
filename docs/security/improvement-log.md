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
- Before: `evidence/security/codeql/before/` (first CodeQL run, CI run 37797586192 (PR #4, head 8c47d54): python and actions analysed, 0 findings at any severity; SARIF saved unedited)
- Fix: `.github/workflows/ci.yml` (job `codeql`, no paths filter, no AWS access) and `security/codeql/sarif_gate.py`, which fails the job on security-severity 7.0 or more. Terraform is not supported by CodeQL; Checkov covers it. GHAS status: the repo is public, so code scanning upload to the Security tab is available at no cost.
- After: `evidence/security/codeql/after/` (same result, 0 findings; nothing needed fixing)
- Outcome: resolved (control in place, no findings)
- Control area: vulnerability management, secure SDLC

### SEC-008: SonarCloud added to CI
- Date / PR: 2026-10-08 / feature/sec-tools
- Source: SonarCloud via `SonarSource/sonarqube-scan-action` v8.3.0, quality gate wait enabled
- Risk: no static analysis for bugs, code smells and security hotspots across app and Terraform code.
- Before: `evidence/security/sonar/before/` (first analysis, PR #2: gate FAILED on coverage 0.0% and reliability rating C; see SEC-013 and SEC-014)
- Fix: `.github/workflows/ci.yml` (job `sonar`), `sonar-project.properties`. The job fails with a clear message if any setting is missing, and fails when the quality gate fails. Coverage is not reported: `pytest-cov` is not a dependency yet.
- After: `evidence/security/sonar/after/` (CI run 37797586192 (PR #4, head 8c47d54): gate PASSED, 0 new issues, 0 hotspots, 100% coverage on new code, 0% duplication)
- Outcome: resolved. Gate enforcement is scoped to pull requests (SEC-015).
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

### SEC-011: CI and CD restructured into ci.yml and cd.yml
- Date / PR: 2026-10-08 / feature/sec-tools
- Source: design review (separation of duties), not a scanner finding
- Risk: checks and deploys were spread over several files, and the release path did not scan the exact image it pushed. Mixing checks and deploys in one file makes it hard to show that checks cannot reach AWS.
- Before: `app-ci.yml`, `terraform-ci.yml`, `codeql.yml`, `sonar.yml` (checks) and no release workflow yet
- Fix: `ci.yml` holds every check with no AWS access (jobs `app-test-lint`, `app-trivy`, `app-build`, `app-image-scan`, `app-checkov`, `tf-validate`, `tf-checkov`, `codeql`, `sonar`). `cd.yml` builds, scans the image, pushes by commit SHA and deploys dev then prod, and is the only app workflow with AWS credentials. The pushed image is the exact tar that passed the scan. `terraform-apply.yml` and `terraform-destroy.yml` stay separate (different environments and approvals). Old files deleted.
- After: required check names are unchanged: `app-test-lint`, `app-trivy`, `app-checkov`, `tf-validate`, `tf-checkov`, `codeql`, `sonar` (new, also available: `app-build`, `app-image-scan`). Checkov and actionlint results recorded in the PR.
- Outcome: resolved. Accepted trust-policy risk recorded as EXC-004.
- Control area: change control, least privilege, supply chain

### SEC-012: Trivy image scan did not honor trivy.yaml
- Date / PR: 2026-10-08 / feature/sec-tools
- Source: Trivy v0.75.0 via `aquasecurity/trivy-action` v0.36.0; CI job `app-image-scan` (and the CD `build` scan). Classification: defect in our workflow, not a scanner issue and not an image-reference problem. The log line `trivy image .` is cosmetic: the scan did run on `image.tar` (`ArtifactName: image.tar`, Debian 13.7, 87 OS packages).
- Risk: the gate documented in `security/trivy/trivy.yaml` (HIGH and CRITICAL, unfixed ignored) was not what ran. The action exports its own defaults (all severities, `ignore-unfixed` false), which override the config file, so the job failed on 44 HIGH findings (8 CVEs in `util-linux`, `libacl1`, `ncurses`, `systemd`, `perl-base`) that no vendor has fixed. Nothing could pass until upstream patches, so the gate would have been disabled in practice or routinely bypassed.
- Before: `evidence/security/trivy/before/image/` (raw CI report, unedited, and summary). 44 HIGH, 0 CRITICAL, 0 with a fix available.
- Fix: `ci.yml` (`app-trivy`, `app-image-scan`) and `cd.yml` (`build`) pass `severity: HIGH,CRITICAL`, `ignore-unfixed: "true"` and `exit-code: "1"` as action inputs, mirroring `trivy.yaml` (comments in both places say to change them together). The gate still fails on any HIGH or CRITICAL that has a fix. No `.trivyignore`: there are no fixable HIGH or CRITICAL findings, so no exception and no EXC row was needed. Commit: see git log (`ci: apply trivy.yaml policy to Trivy steps`).
- After: `evidence/security/trivy/after/image/` (same Trivy version, same environment the action exports). 0 fixable findings, exit 0.
- Confirmed in CI: `app-image-scan` passed on CI run 37797586192 (PR #4, head 8c47d54); report in `evidence/security/trivy/after/ci-image/` (0 findings).
- Outcome: resolved. Residual: unfixed upstream HIGH CVEs in the base image stay visible in each report; Dependabot bumps the pinned base image when a patched build exists.
- Control area: vulnerability management

### SEC-013: Explicit timeouts on the rotation Lambda's Secrets Manager client
- Date / PR: 2026-10-08 / feature/sec-tools
- Source: SonarCloud, reliability rating C on new code (quality gate condition), issue at `terraform/modules/secret-rotation/src/lambda_function.py:16` "Set an explicit timeout for this network call to prevent hanging executions in Lambda functions"
- Risk: a hung network call to Secrets Manager would hold the invocation until the Lambda timeout and could leave a rotation half done.
- Before: `evidence/security/sonar/before/` (check run summary and annotation from the SonarCloud GitHub check on `dd1188e`, PR #2, unedited)
- Fix: `boto3.client("secretsmanager", config=Config(connect_timeout=3, read_timeout=5, retries={"max_attempts": 2, "mode": "standard"}))`. Commit: see git log (`fix: set explicit timeouts on rotation Lambda client`).
- After: `evidence/security/sonar/after/` (CI run 37797586192 (PR #4, head 8c47d54)): 0 new issues, reliability condition passed
- Outcome: resolved
- Control area: reliability, secrets management

### SEC-014: Test coverage reported to SonarCloud (rotation Lambda tests added)
- Date / PR: 2026-10-08 / feature/sec-tools
- Source: SonarCloud quality gate condition "Coverage on new code >= 80%": 0.0% (failed). No coverage report reached Sonar, and the rotation Lambda had no tests.
- Risk: untested security-relevant code (secret rotation) and a gate that could not pass.
- Before: `evidence/security/sonar/before/` (check run summary, unedited JSON)
- Fix: `pytest-cov==7.1.0` added to `app/requirements-dev.txt`. 13 unit tests for the rotation Lambda in `terraform/modules/secret-rotation/tests/` (all four steps, idempotency, error paths, a test that secret values are never logged, a test that the client has explicit timeouts). `ci.yml`: `app-test-lint` writes `app/coverage.xml`, new job `lambda-test` writes `lambda-coverage.xml`, and the `sonar` job downloads both. `sonar-project.properties` sets `sonar.python.coverage.reportPaths`. Only the test directories are excluded from sources; no source is excluded from coverage. Commit: see git log (`test: add coverage and rotation Lambda tests`).
- After: local run, same pytest and pytest-cov versions: app 97% (199 statements, 6 missed), rotation Lambda 100% (50 statements). SonarCloud on CI run 37797586192 (PR #4, head 8c47d54): 100.0% coverage on new code (`evidence/security/sonar/after/`).
- Outcome: resolved
- Control area: secure SDLC, secrets management
### SEC-015: Sonar quality gate wait scoped to pull requests
- Date / PR: 2026-10-08 / feature/sec-tools
- Source: SonarCloud free-plan restriction. The `sonar` job on a push to `dev` completed the scan and upload, then failed with: `ERROR Failed to get Quality Gate status - Organization is not allowed to access data from non main branches.`
- Risk: a push to `dev` could show a red `sonar` run that carries no gate result, which hides real failures behind a plan limitation.
- Before: push run on `dev` failed at the gate step (run 37794090882 family, 2026-10-08 15:04 UTC); the pull_request run returned a real gate result.
- Fix: `qualitygate.wait` is `true` only when `github.event_name == 'pull_request'`, `false` otherwise (`ci.yml`, `sonar` job). The missing-settings pre-check, the job name `sonar` and the required check are unchanged; no `continue-on-error`. Commit: 923dc9c768be14f1c96e33678c2c89bc443247a4 (`ci: enforce sonar gate on pull requests only`).
- After: the PR gate still enforces (PR #4 run returned "Quality Gate passed" with wait=true). Push runs only upload the analysis.
- Outcome: resolved for PR gating; push-branch gating is a plan limitation, not a suppression, so there is no exceptions-register row.
- Control area: vulnerability management, change control

### SEC-016: Lambda package missing at tf-apply (plan and apply on separate runners)
- Date / PR: 2026-10-08 / feature/fix-lambda-package
- Source: `tf-apply` failure `reading ZIP file (modules/secret-rotation/build/cloudbatch818-zein-hcsecops-rotate-api-key.zip): ... no such file or directory`. Classification: defect in our workflow, not a scanner finding.
- Risk: the Lambda zip is built by the `archive_file` data source during plan. `tf-plan` and `tf-apply` run on different runners, so the zip did not exist at apply and a partial apply left the stack half created. Rebuilding the zip separately at apply would also risk deploying bytes that differ from the reviewed plan.
- Before: failed run log (partial apply: network, KMS, ECR, DynamoDB, secret, budget, flow logs, rotation role, DLQ, security group and log group created; Lambda not created). Checkov on `terraform/` and the workflows was 112 passed, 0 failed, 4 skipped before the change.
- Fix: `terraform-apply.yml` `tf-plan` records `zips.sha256` for every `modules/*/build/*.zip` and uploads the exact zips with the plan; `tf-apply` downloads them to the same paths and verifies the checksums before `terraform apply tfplan`. The module is unchanged, so `source_code_hash` (output of `archive_file`) still changes the plan when the Lambda code changes. Commit: see git log (`ci: ship the Lambda zip with the plan artifact`).
- After: `evidence/security/checkov/after/fix-lambda-package/` (same command and version, no new skips); actionlint exit 0.
- Outcome: resolved
- Control area: change control, build integrity

### SEC-017: Rotation Lambda execution role could not manage its network interfaces
- Date / PR: 2026-10-08 / feature/eks-fargate
- Source: `tf-apply` failure on `aws_lambda_function`: `InvalidParameterValueException: The provided execution role does not have permissions to call DeleteNetworkInterface on EC2`. Classification: defect in our IAM policy.
- Risk: the rotation Lambda could not be created, so the API key had no rotation.
- Before: `ec2:DeleteNetworkInterface` was allowed only with an `ec2:Subnet` condition. Lambda checks Delete without subnet context, so the condition never matched. `ec2:AssignPrivateIpAddresses`, `ec2:UnassignPrivateIpAddresses` and `ec2:DescribeVpcs` were missing.
- Fix: the role now has the same ENI actions as the AWS managed policy `AWSLambdaVPCAccessExecutionRole`. Create stays limited to the function's subnets and security group by resource ARN. Delete, Assign and Unassign are limited to network interfaces in this account and region, without the subnet condition. Describe actions use `*` because EC2 does not support resource scoping for them. Log, DLQ, Secrets Manager and KMS statements are unchanged. Commit: see git log (`fix: rotation Lambda ENI permissions`).
- After: verified by the next `tf-apply` (Lambda creation). Checkov on `terraform/` in `evidence/security/checkov/after/terraform-eks/`.
- Outcome: fixed in code; confirmation pending the next apply
- Control area: least privilege, secrets management

### SEC-018: EKS cluster endpoint (accepted risk, D1)
- Date / PR: 2026-10-08 / feature/eks-fargate
- Source: Checkov 3.3.26, `CKV_AWS_38` and `CKV_AWS_39` on `module.eks.aws_eks_cluster.this` (confirmed in the baseline run)
- Risk: the Kubernetes API is reachable from the internet. Authentication is still required.
- Before: `evidence/security/checkov/before/terraform-eks/` (4 failed: these two plus SEC-021)
- Fix: none possible with GitHub-hosted runners. Inline skips with reason, owner and expiry; EXC-005 lists the compensating controls.
- After: `evidence/security/checkov/after/terraform-eks/`
- Outcome: accepted risk (EXC-005, expires 2027-04-08)
- Control area: access control

### SEC-019: Apply role is cluster admin (accepted risk, D2a)
- Date / PR: 2026-10-08 / feature/eks-fargate
- Source: design decision, not a scanner finding
- Risk: the apply role can do anything in the cluster.
- Before: no cluster
- Fix: `bootstrap_cluster_creator_admin_permissions = false`, so admin exists only as an explicit access entry for the apply role, which is used only behind the `infra` and `infra-destroy` approvals. Deploy roles get `AmazonEKSEditPolicy` scoped to one namespace each. The plan role gets no cluster access; in-cluster resources live in a second root planned by the apply role (D2b).
- After: `terraform/main.tf` (`access_entries`), `terraform/cluster-addons/`
- Outcome: accepted risk (EXC-006, expires 2027-04-08)
- Control area: access control, least privilege

### SEC-020: Plan role could not read budget tags
- Date / PR: 2026-10-08 / feature/eks-fargate (policy applied by hand by Moulaye)
- Source: `tf-plan` failure: `AccessDeniedException ... not authorized to perform: budgets:ListTagsForResource on resource: ...budget/cloudbatch818-zein-hcsecops-monthly`
- Risk: the read-only plan could not complete, blocking every apply.
- Before: plan policy allowed `budgets:View*` and `budgets:Describe*` only
- Fix: `budgets:ListTagsForResource` added to the plan role (live), mirrored in `docs/bootstrap-policies/plan-policy.json`. Still read-only.
- After: next `tf-plan` run
- Outcome: resolved
- Control area: least privilege, change control

### SEC-021: Network isolation for Fargate pods (security groups for pods)
- Date / PR: 2026-10-08 / feature/eks-fargate
- Source: design review. AWS docs: VPC CNI network policies apply to EC2 Linux nodes only, not Fargate (https://docs.aws.amazon.com/eks/latest/userguide/cni-network-policy.html). Security groups for Pods apply to EC2 nodes "and Fargate" (https://docs.aws.amazon.com/eks/latest/userguide/security-groups-for-pods.html; https://repost.aws/knowledge-center/eks-configure-fargate-pod-security-group).
- Risk: a Kubernetes NetworkPolicy would be accepted but not enforced on Fargate pods.
- Before: design relied on a default-deny NetworkPolicy.
- Fix: per-namespace pod security groups in `module.eks` (app port from the VPC only, HTTPS and DNS out), to be attached with a `SecurityGroupPolicy` in the Phase 4 chart alongside the cluster security group. NetworkPolicy manifests stay for intent. `vpc-cni` and `kube-proxy` are not installed (`bootstrap_self_managed_addons = false`). Checkov flags the groups as unattached (`CKV2_AWS_5`) because the attachment happens in Kubernetes; that skip is pending owner approval.
- After: enforcement is not yet verified; verify after Phase 4 by checking that a pod's ENI carries the pod security group.
- Outcome: resolved for dev and prod on 2026-10-09 (SEC-032: pod security groups attached and verified; EXC-007 closed). Was: in progress (pending CKV2_AWS_5 decision and Phase 4).
- Control area: network segmentation

### SEC-022: Read-only application (write routes removed)
- Date / PR: 2026-10-08 / feature/eks-fargate
- Source: design review. The app role is read-only (`GetItem`, `Query`, `Scan`), but the app had `POST` and `DELETE /patients` and seeded an empty table at startup, so the first deploy would have failed on `PutItem`.
- Risk: write routes on patient data widen the attack surface and need write IAM; a startup seed needs write IAM too.
- Before: `POST`, `DELETE /patients`, `seed_if_empty` at startup, write methods on the DynamoDB store.
- Fix: routes and write methods removed (`POST`/`DELETE` now return 405), no startup seed, frontend read-only. Local runs and tests load the in-memory store from `app/data/patients.json`. Commit 195fb12.
- After: 16 tests pass, coverage 98% (was 97%); container check: 30 patients, POST 405, DELETE 405.
- Outcome: resolved
- Control area: least privilege, data protection

### SEC-023: Patients table seeded by Terraform
- Date / PR: 2026-10-08 / feature/eks-fargate
- Source: follows SEC-022.
- Risk: without a seed the read-only app would serve an empty table.
- Before: the app seeded the table at startup.
- Fix: `aws_dynamodb_table_item` for each record in `app/data/patients.json` (30 synthetic items, keyed by `patient_id`, typed `S` and `N`), in the existing KMS-encrypted table with point-in-time recovery. No output exposes item values. Plan role gains `dynamodb:GetItem` on that table only, so refreshes work (file change, Moulaye attaches). Commit 6dbb742.
- After: verified by the next apply; a second apply must show no change for the items.
- Outcome: resolved in code; confirmation pending apply
- Control area: data protection, change control

### SEC-024: CKV2_AWS_5 on pod security groups (accepted, EXC-007)
- Date / PR: 2026-10-08 / feature/eks-fargate
- Source: Checkov 3.3.26 `CKV2_AWS_5` on `module.eks.aws_security_group.pods` (both namespaces)
- Risk: none by itself; Checkov cannot see the Kubernetes `SecurityGroupPolicy` that attaches the groups.
- Before: `evidence/security/checkov/after/terraform-eks/` (2 failed)
- Fix: inline skip on that resource only, owner Moulaye, expiry 2027-04-08, EXC-007. Phase 4 must verify the attachment or remove the skip.
- After: `evidence/security/checkov/after/terraform-eks-seed/`
- Outcome: accepted risk (EXC-007)
- Control area: network segmentation

### SEC-025: Seeded patient values hidden in plan and apply output
- Date / PR: 2026-10-08 / feature/eks-fargate
- Source: design review after SEC-023. The repo is public, so CI logs and the `plan.txt` artifact are readable by anyone; `terraform plan` printed each seeded item's full JSON.
- Risk: patient-shaped data in public logs. Synthetic today, but the same pipeline would leak real records.
- Before: plan output showed every attribute of each `aws_dynamodb_table_item`.
- Fix: the item body is wrapped in `sensitive()`, so plan and apply output and `plan.txt` show `(sensitive value)`. The key stays visible in the address (`seed["P001"]`). No output, log line or artifact carries the body. Verified with `terraform console` (no AWS) that `nonsensitive(item)` equals the previous plain JSON for all 30 items, so the value sent to DynamoDB, and the second-apply diff, are unchanged. Commit 7644331.
- After: next `tf-plan` log shows `(sensitive value)` for `item`.
- Outcome: resolved for logs and artifacts. Residual: values remain in Terraform state (EXC-008).
- Control area: data protection

### SEC-026: Patients table classified, with a guard on the classification
- Date / PR: 2026-10-08 / feature/eks-fargate
- Source: design review after SEC-023.
- Risk: nothing marked the table as holding synthetic data, and nothing stopped it being treated as real data storage.
- Before: no classification tag.
- Fix: tag `DataClassification = synthetic` on the patients table only, from module variable `data_classification` (default `synthetic`, validation allows only `synthetic` or `phi`). `phi` is not set anywhere and must not be until the Phase 7 items are closed (KMS state, EXC-008; plan-role item read, EXC-004). Commit 4ea491c.
- After: tag visible on the table after apply.
- Outcome: resolved. State encryption accepted as EXC-008.
- Control area: data protection, asset classification

### SEC-027: Rotation Lambda ENI actions granted on "*" (supersedes SEC-017)
- Date / PR: 2026-10-08 / feature/fix-lambda-eni-role
- Source: `tf-apply` on main after the Phase 3 merge failed only on `module.secret_rotation.aws_lambda_function.this`: `InvalidParameterValueException: The provided execution role does not have permissions to call DeleteNetworkInterface on EC2`. Classification: defect in our IAM policy.
- Risk: the rotation Lambda could not be created, so the API key had no automatic rotation.
- Before: SEC-017 scoped the ENI actions to network-interface, subnet and security-group ARNs. That scoping was wrong: Lambda checks the execution role when the function is created, before any network interface exists, so resource-scoped grants fail the check.
- Fix: one statement with the EC2 actions of the AWS managed policy `AWSLambdaVPCAccessExecutionRole` (`CreateNetworkInterface`, `DescribeNetworkInterfaces`, `DeleteNetworkInterface`, `DescribeSubnets`, `AssignPrivateIpAddresses`, `UnassignPrivateIpAddresses`) plus `DescribeSecurityGroups` and `DescribeVpcs`, on `*`. `CreateNetworkInterface` is on `*` too, because a scoped Create could not be shown to pass the same check. No other `ec2:` action, no `ec2:*`. Log, DLQ, Secrets Manager and KMS statements unchanged. Commit 189a58a.
- After: Checkov flags `CKV_AWS_356` and `CKV_AWS_111` on this policy; the skip and EXC-009 await owner approval. Lambda creation is confirmed by the next `tf-apply`.
- Outcome: fixed in code; supersedes SEC-017. Exception pending approval.
- Control area: access control, least privilege

### SEC-028: Scoped Checkov skips for the Lambda ENI statement (EXC-009)
- Date / PR: 2026-10-08 / feature/fix-lambda-eni-role (PR #12)
- Source: Checkov 3.3.26 in CI runs 37819426414 (job 113456328707) and 37819393361 (job 113456223946): `CKV_AWS_111` and `CKV_AWS_356` on `module.secret_rotation.aws_iam_policy_document.permissions`, `/modules/secret-rotation/main.tf:52-107` (called from `/main.tf:50-59`), caused by the `VpcLambdaNetworkInterfaces` statement from SEC-027.
- Risk: the rotation role can create, delete and describe network interfaces account-wide. Required by Lambda's create-time check (`AWSLambdaVPCAccessExecutionRole`).
- Before: CI 237 passed, 2 failed, 8 skipped.
- Fix: Checkov skips are per resource, and lines 52-107 were the whole permissions document (Secrets Manager, KMS, logs, DLQ, X-Ray). To keep the skips on the ENI statement only, it moved to its own document `vpc_eni` and inline policy `vpc-network-interfaces` on the same role; the Lambda `depends_on` includes it so the permission exists before the create-time check. Inline skips for `CKV_AWS_111` and `CKV_AWS_356` on `vpc_eni` only, reason per EXC-009. No directory- or file-level skip.
- After: `evidence/security/checkov/after/fix-lambda-eni-role/`: 250 passed, 0 failed, 10 skipped. The permissions document passes both checks without a skip.
- Outcome: accepted risk (EXC-009, expires 2027-04-08)
- Control area: access control, least privilege

### SEC-029: Operator read-only EKS access entry imported into Terraform
- Date / PR: 2026-10-09 / feature/eks-operator-import
- Source: manual change review, not a scanner finding. An operator access entry was created by hand in the EKS console (type Standard, Kubernetes username `zein`, `AmazonEKSViewPolicy` only, cluster scope) and was unmanaged.
- Risk: access that exists only in the console is invisible to review and to drift detection, and a later apply or destroy would not account for it.
- Before: the entry existed only in the console.
- Fix: `aws_eks_access_entry.operator` and `aws_eks_access_policy_association.operator_view` in `terraform/main.tf`, brought under Terraform by import (`docs/runbooks/eks-operator-import.md`), not recreated. View policy at cluster scope only; no Edit or Admin policy and no groups in any operator resource. The principal ARN is built from the account data source and a user-name variable, so no account ID is hardcoded.
- After: after import, the plan should show no changes for these two resources.
- Outcome: resolved in code; confirmation pending the import and the next plan
- Residual risks: the operator IAM user holds one long-lived access key on the workstation (13 days old at the time of this entry); the planned move is to IAM Identity Center. The public API endpoint remains open to 0.0.0.0/0 under EXC-005.
- Control area: access control, change control
- Update (2026-10-09): the import completed through the normal `terraform-apply` run and the two `import {}` blocks were removed (`chore: remove operator import blocks after import`). The resources are now managed normally; see `docs/runbooks/eks-operator-import.md`.

### SEC-030: healthcare-api Helm chart with Pod Security `restricted` settings
- Date / PR: 2026-10-09 / feature/helm-chart
- Source: Phase 4 build. Checkov 3.3.26 (kubernetes framework) on the rendered chart found three issues, each fixed, none suppressed.
- Risk: a chart that deploys the app must satisfy Pod Security `restricted` (already enforced on both namespaces) and keep the image supply chain tight.
- Before: `evidence/security/checkov/before/helm-chart/`: 186 passed, 6 failed (3 checks, each on dev and prod). Reproduced from the chart with the fixes switched off, because the first run was not saved before fixing.
  - `CKV_K8S_43` image not pinned by digest
  - `CKV_K8S_15` pull policy not `Always`
  - `CKV2_K8S_6` no NetworkPolicy
- Fix: `helm/healthcare-api/` (Deployment, Service, ServiceAccount with the IRSA annotation, Ingress for the ALB, PodDisruptionBudget, HPA off by default, NetworkPolicy, SecurityGroupPolicy off by default). Pod and container: `runAsNonRoot`, UID 10001, `allowPrivilegeEscalation: false`, `readOnlyRootFilesystem: true`, all capabilities dropped, `seccompProfile: RuntimeDefault`, no API token mounted. No `/tmp` volume: the app runs with `--read-only` and no tmpfs (checked in a container). The image is pulled by digest (CD passes it), pull policy `Always`, and a NetworkPolicy (default-deny plus the app port and DNS/HTTPS) is rendered. The NetworkPolicy is not enforced on Fargate (SEC-021); isolation there comes from security groups for pods (SEC-032).
- After: `evidence/security/checkov/after/helm-chart/`: 192 passed, 0 failed, 0 skipped. `helm lint` clean for both environments; kubeconform strict: 13 valid, 1 skipped (the SecurityGroupPolicy CRD has no published schema).
- Outcome: resolved
- Control area: runtime hardening, supply chain

### SEC-031: CD deploy flags and deploy-time values
- Date / PR: 2026-10-09 / feature/helm-chart
- Source: design review of `cd.yml` against the new chart and Helm 4.3.0.
- Risk: `--atomic` is deprecated in Helm 4 (`Flag --atomic has been deprecated, use --rollback-on-failure instead`), and the chart needs account-dependent values that must not be committed.
- Before: `helm upgrade --install ... --atomic --wait`; no way to pass the IRSA role, certificate, digest or VPC CIDR.
- Fix: `--rollback-on-failure --wait --timeout 5m`. The deploy jobs now resolve, at run time: the image digest (`ecr describe-images`, the same call and permission as the old existence check), the account ID (`sts get-caller-identity`) to build the IRSA role ARN `<account>:role/<cluster name>-app-<environment>`, and the ACM certificate ARN by its wildcard domain. They pass them with `--set`, with the VPC CIDR from `VPC_CIDR`. The smoke test step is unchanged. The deploy roles need one new read permission, `acm:ListCertificates` (`docs/bootstrap-policies/deploy-dev-policy.json`, `deploy-prod-policy.json`, attached by hand).
- After: actionlint exit 0; Checkov on workflows: 0 failed. First real run is the next merge to main touching `app/` or `helm/`.
- Outcome: resolved in code; confirmation pending the first deploy
- Control area: change control, supply chain

### SEC-032: SecurityGroupPolicy created from cluster-addons by the apply role (EXC-007 stays open)
- Date / PR: 2026-10-09 / feature/helm-chart, then feature/sgp-addons
- Source: AWS docs, access policy permissions (https://docs.aws.amazon.com/eks/latest/userguide/access-policy-permissions.html). `AmazonEKSEditPolicy` lists core, apps, autoscaling, batch, extensions, networking.k8s.io and policy groups only; it has no rule for `vpcresources.k8s.aws`, so a deploy role cannot create a `SecurityGroupPolicy`. The design plan says not to widen the role.
- Risk: without the policy, the pod security groups from Terraform (EXC-007) are never attached, so Fargate pods only use the cluster security group.
- Before: the groups existed in Terraform and nothing attached them. The first attempt put the policy in the chart behind a flag (off), blocked by the permission above.
- Fix: decision (b). `terraform/cluster-addons` creates one `SecurityGroupPolicy` per app namespace (`kubernetes_manifest.security_group_policy`), applied by the apply role (cluster admin, behind the `infra` approval in `addons-apply`), so the deploy roles are unchanged. The groups are found without IDs in code: the pod group by name in the project VPC (`data.aws_security_group.pods`) and the cluster group from `data.aws_eks_cluster`. The list is the pod group first, then the cluster group, which Fargate pods need to reach the control plane (https://repost.aws/knowledge-center/eks-configure-fargate-pod-security-group). The selector matches the chart's labels. The chart no longer owns a policy: `securityGroupPolicy.enabled` stays `false` and the template fails the render if it is set, so two policies can never select the same pods.
- After: pods get the groups only when created after the policy exists, so the first deploy must come after `addons-apply`, or the pods need a restart. Verification: `docs/runbooks/deploy-check.md` section 5.
- Outcome (2026-10-07 to 2026-10-09): in progress while EXC-007 stayed open until the pods were checked.
- Control area: network segmentation, least privilege
- Verification (2026-10-09): pod IPs from `kubectl get pods -n <namespace> -o wide` matched to pod-group ENIs in EC2 (us-east-2). Every pod interface carries the pod group and the cluster group.
  - dev: pod IPs <pod-ip-dev-1> (eni-<dev-pod-1>, us-east-2b) and <pod-ip-dev-2> (eni-<dev-pod-2>, us-east-2a); pod group sg-<pod-dev>, cluster group sg-<cluster-default>.
  - prod: pod IPs <pod-ip-prod-1> (eni-<prod-pod-1>, us-east-2b) and <pod-ip-prod-2> (eni-<prod-pod-2>, us-east-2a); pod group sg-<pod-prod>, cluster group sg-<cluster-default>.
- Outcome (final): resolved for dev and prod. EXC-007 closed on 2026-10-09 (row kept, with the evidence table below the register).

### SEC-033: Prod DNS alias pointed at the dev load balancer
- Date / PR: 2026-10-09 / docs/close-exc-007
- Source: operator check during the Phase 4 verification, not a scanner finding.
- Risk: the prod hostname resolved to the dev load balancer, so prod requests would have gone to another environment's load balancer while the deploy looked verified.
- Before: the Route 53 alias record for the prod hostname first pointed at the dev ALB. The HTTPS check against the prod hostname returned a 404 from the load balancer, which exposed it.
- Fix: the alias record was repointed to the prod ALB. After the change, `/health` and `/ready` return 200 on the prod hostname.
- Control gap: nothing checks that a DNS alias target matches the Ingress address of its own environment before a deploy is marked verified. `scripts/smoke-test.sh` connects straight to the ingress address with `curl --connect-to`, so it does not exercise DNS at all and could not have caught this. No Terraform or pipeline code manages these alias records (the Terraform ACM module creates only the certificate validation records).
- After: the prod hostname resolves to the prod ALB and answers 200 on `/health` and `/ready`.
- Outcome: resolved. Gap open: add a check that resolves the environment hostname and compares it with the Ingress load balancer address before a deploy is called verified.
- Control area: change control, availability

### SEC-034: Roll pods when the API key secret version changes
- Date / PR: 2026-10-09 / feature/secret-rotation-rollout
- Source: design review of rotation (SEC-003, `docs/runbooks/rotation.md`). The app reads the API key only at startup, so a rotated key does nothing until the pods restart, and the restart was a manual step.
- Risk: after a rotation the running pods hold the old key while the secret holds the new one, so clients using the new key get 403 until someone restarts the pods.
- Before: manual `kubectl rollout restart` after every rotation.
- Fix: both deploy jobs in `cd.yml` run `aws secretsmanager describe-secret` on the API key secret before Helm, read the version ID that carries `AWSCURRENT`, and pass it as `--set podAnnotations.secret-version=<id>`. The chart renders it on the pod template, so a new version changes the template and the next deploy rolls the pods. Empty annotation values are not rendered: if the secret has no current version, nothing is added and nothing restarts. The step never calls `get-secret-value` and never prints the value. The secret name is built as `<cluster name>-api-key` and also passed to the chart as `env.apiKeySecretName`, so the app reads the secret that was described.
- What this does and does not do:
  - Rotation takes effect on the next deploy, not immediately.
  - The version ID is not secret; it is a metadata identifier.
  - The deploy roles gain one read-only permission, `secretsmanager:DescribeSecret` on the one secret (`docs/bootstrap-policies/deploy-dev-policy.json`, `deploy-prod-policy.json`; attached by hand). They still have no `GetSecretValue`.
  - The rotation Lambda is not wired to trigger a deploy, so after a scheduled rotation nothing rolls the pods until some deploy runs. Triggering one (for example an event on rotation that starts `cd.yml`) is open work.
- After: `helm lint --strict` and `actionlint` clean; the annotation renders when set and is absent when empty. First real effect is the next deploy after the policy statement is attached.
- Outcome: resolved in code; residual gap recorded (no automatic trigger)
- Control area: secrets management, availability
- Verification (2026-10-09), reported by the operator. No key value, hostname-and-key pair or patient record is recorded here, only version IDs, status codes and times.
  - Rotation: performed by hand in Secrets Manager at about 13:42 (America/New_York), an edit of the secret value, not a run of the rotation Lambda. New current version ID: `3bb794ac-5acf-4a32-9e4b-f61deb8d2773` (`AWSCURRENT`). Previous version ID: `915c4d26-37bb-4dc9-b9ec-bfeeba0bc4ba` (`AWSPREVIOUS`). These are identifiers, not secrets.
  - Redeploy: CD run for `157cc3a` on `main` (merge of PR #24). The prod and dev deploy jobs were approved. Status: Success, 5m 23s.
  - Results after the redeploy:

    | Environment | `/ready` (no key required) | `/patients` with the new key | `/patients` with the old key |
    |---|---|---|---|
    | dev | 200 | 200 | 403 |
    | prod | 200 | 200 | 403 |

  - Pod annotation `secret-version` matches the new version ID: **confirmed** by the operator on both environments. The dev and prod Deployments carry `secret-version` = `3bb794ac-5acf-4a32-9e4b-f61deb8d2773`, which is the `AWSCURRENT` version in Secrets Manager; the previous version is `AWSPREVIOUS`, so the rotation is the one expected. The earlier "not confirmed" was a check not yet run, not a failed rollout.
  - Outcome: rotation accepted and the old key rejected on both environments, and the pods carry the new secret version (confirmed). The status codes are as reported by the operator from their own test; the key itself is not recorded.
  - Gap still open: rotation does not trigger a deploy automatically. After a rotation, pods keep the old key until some deploy runs (as happened here).

### SEC-035: Detective controls added (Security Hub, GuardDuty, CloudTrail)
- Date / PR: 2026-10-09 / feature/phase7-detective
- Source: design plan, Phase 7 baseline ("CloudTrail, GuardDuty, Security Hub"). New Terraform module `terraform/modules/detective`, called from the main root, us-east-2 only.
- Risk: no audit trail or threat detection existed. API activity and threats against the cluster and account were unrecorded.
- Before: none of the three services were enabled. `evidence/security/checkov/before/detective/` is the first Checkov run on the new code: 280 passed, 7 failed (all in the new module), 10 skipped (the existing approved ones).
- Fix: Security Hub with the FSBP standard; a GuardDuty detector with S3 data events and EKS audit log features; a single-region CloudTrail with log file validation, encrypted with the project KMS key, delivering to a new bucket (`<prefix>-logs-cloudtrail-<account id>`: public access blocked, versioning, KMS encryption, lifecycle, TLS-only, writes limited to the trail). The KMS key policy gains one statement for the named trail only. No account IDs or ARNs are written in code.
- Open Checkov findings, not suppressed (waiting for a decision per finding):
  - `CKV_AWS_67` trail not multi-region: the single-region choice was explicit.
  - `CKV_AWS_252` no SNS topic, `CKV2_AWS_10` no CloudWatch Logs integration, `CKV_AWS_18` no S3 access logging, `CKV2_AWS_62` no S3 event notifications: each needs an extra resource and cost.
  - `CKV_AWS_144` no cross-region replication: not wanted for a log bucket in a destroy-after-session stack.
  - `CKV2_AWS_3` GuardDuty not enabled "to specific org/region": an organization-level check that a single account cannot satisfy.
- Residual: Security Hub control findings need AWS Config recording, which this module does not enable.
- After: pending the decisions above and the first apply. IAM: none needed for the first apply (see `docs/bootstrap-policies/README.md`).
- Outcome: four logging findings fixed and three accepted in SEC-036 (EXC-010 to EXC-013).
- Control area: audit logging, threat detection

### SEC-036: Detective logging gaps fixed, three findings accepted
- Date / PR: 2026-10-10 / feature/phase7-detective
- Source: Checkov 3.3.26 on `terraform/modules/detective` (SEC-035): `CKV_AWS_252`, `CKV2_AWS_10`, `CKV_AWS_18`, `CKV2_AWS_62` fixed; `CKV_AWS_67`, `CKV2_AWS_3`, `CKV_AWS_144` accepted.
- Before: `evidence/security/checkov/after/detective/module-before/` (the module at commit 1cdcc3e): 30 passed, 7 failed, 0 skipped.
- Fixes, each a real gap:
  - `CKV_AWS_252` SNS topic for CloudTrail notifications, encrypted with the project key. Gap: nothing signalled log delivery, so a stopped trail would go unnoticed. Only `cloudtrail.amazonaws.com` (this trail) and `s3.amazonaws.com` (this bucket and account) may publish; the KMS key policy lets those two services use the key only for this topic (SNS encryption context). No subscriber yet; alert routing is Phase 6. Cost: per publish request, a few thousand a month here, near zero.
  - `CKV2_AWS_10` CloudWatch Logs log group `/<prefix>/cloudtrail` (KMS, 365 days) and IAM role `<prefix>-cloudtrail-logs`, trusted only by CloudTrail for this trail, allowed only `logs:CreateLogStream` and `logs:PutLogEvents` on that log group. Gap: S3 delivery alone has no near-real-time search or metric filters, which the Phase 6 alarms need. Cost: CloudWatch Logs ingestion and storage, under $1 a month for management events of this stack.
  - `CKV_AWS_18` server access logging from the trail bucket to a new bucket `<prefix>-logs-cloudtrail-access-<account id>` (public access blocked, versioning, same lifecycle, TLS-only, delivery limited to the logging service from the trail bucket). Gap: reads of the audit logs themselves were not recorded. Cost: small S3 storage. S3 delivers server access logs only to a target with SSE-S3 default encryption, so this bucket uses AES256, not the project key.
  - `CKV2_AWS_62` object-created notifications from the trail bucket to the SNS topic, and EventBridge notifications on the access-log bucket (free for S3 events on the default bus, and it avoids an SNS message per access-log file). Gap: no event when new log files land. Cost: SNS publishes as above.
- Accepted, each with an inline skip on its one resource (no blanket or module-wide skips): `CKV_AWS_67` EXC-010, `CKV2_AWS_3` EXC-011, `CKV_AWS_144` on the trail bucket EXC-012. `force_destroy` on both log buckets: EXC-013 (process control).
- After: `evidence/security/checkov/after/detective/`: module 104 passed, 2 failed, 3 skipped (EXC-010 to EXC-012); full `terraform/` 355 passed, 2 failed, 13 skipped (the 10 existing approved skips plus the 3 new). No regression.
- Still open, not suppressed (owner decision needed): the new access-log bucket fails `CKV_AWS_145` (S3 server access logging requires SSE-S3 on the target, so KMS is not possible) and `CKV_AWS_144` (no replication, same reason as EXC-012).
- Update (2026-10-10): the two access-log bucket findings are accepted with inline skips on `aws_s3_bucket.access_logs` only: `CKV_AWS_145` under EXC-014 and `CKV_AWS_144` under EXC-012 (extended to this bucket). Evidence: `evidence/security/checkov/after/detective/`.
- Note (2026-10-12): the statements above that alert routing and the alarms are Phase 6 are not current. The code has no alarm resource and no SNS subscription resource (searched 2026-10-12), so notifications are published but delivered nowhere. The original text is kept.
- Outcome: resolved; all detective findings are fixed or accepted with an exception (EXC-010 to EXC-014).
- Update (2026-10-10): a GuardDuty detector already existed in us-east-2 (one per region), so Terraform could not create one. The pre-existing detector is adopted by an `import {}` block in `terraform/modules/detective`, with its ID from a data source lookup in the root (`data.aws_guardduty_detector.existing`), not recreated. Settings are unchanged (`enable = true`, 15-minute publishing, S3 data events and EKS audit logs features), so the first plan shows the import plus an in-place update of the publishing frequency if the existing value differs. After the first successful apply the import block and lookup should be removed (the import block was removed on 2026-10-10, SEC-037; the lookup remains until the detector is unmanaged), and a destroy deletes the detector, so the lookup fails on the next plan until a detector exists again (`docs/runbooks/detective-controls.md`).
- Control area: audit logging, threat detection

### SEC-037: Apply removed the detective log buckets' security configuration while the buckets remained (incident)
- Date / PR: 2026-10-10 / debug/detective-bucket-replace. Recorded as SEC-037 because SEC-036 already exists (detective logging fixes).
- Source: `terraform-apply` run 38079247372 on `main` at `a5fa1cd` (19:18 UTC). Its plan (`tf-plan`, plan role) said `aws_s3_bucket.trail` and `aws_s3_bucket.access_logs` "will be created" and 15 bucket sub-resources "forces replacement" (`Plan: 1 to import, 19 to add, 3 to change, 15 to destroy`). The apply destroyed the 15 sub-resources (public access block, ownership controls, versioning, encryption, lifecycle, bucket policy, notifications, server access logging, on both buckets), then failed to create the buckets with `BucketAlreadyOwnedByYou` because they already exist in AWS.
- Impact: for a window the two buckets existed without their Terraform-managed configuration. That includes the bucket policy (CloudTrail and S3 logging delivery grants, TLS-only deny), the bucket-level public access block, ownership controls, versioning, the lifecycle rule and the notification and logging settings. The operator reports that no public access was opened. This session had no AWS access, so that is not verified here; the buckets have no public-read policy or ACL in code, and ACLs are disabled by ownership controls in the code, but the removed public access block needs a read-only check (commands in the runbook below). CloudTrail log delivery to the trail bucket would fail while its policy was missing. The apply did not destroy the bucket resources, so it did not delete objects; this is not verified in AWS here.
- Evidence (repo, run logs and provider source):
  - Run 38077650190 (18:54 UTC, `cda1a5f`), the first apply of the detective module, created both buckets and all their sub-resources successfully and failed only at the end creating the GuardDuty detector (a detector already existed). So state held the buckets after that run.
  - Run 38079247372 plan job, refresh phase: `aws_s3_bucket.access_logs` and `aws_s3_bucket.trail` were read (`Refreshing state... [id=...]`) and then reported `has been deleted` in the "changes made outside of Terraform" section. The 15 sub-resources refreshed normally and were then planned for replacement only because `bucket` became "known after apply".
  - No code change forces this: bucket names, resource addresses, `force_destroy`, the root inputs and the `name_prefix` default are identical in all four commits that touched the module (1cdcc3e, 90a9d15, d203684, 693ae44); there is no `for_each`, `count` or `moved` block anywhere; plan and apply use the same state key (`main/terraform.tfstate`) and the apply job applied the plan from the same run (`needs: plan`, artifact `tfplan`).
- Root cause (identified from the plan log and the provider source; the underlying 403 itself is inferred and not yet seen in a debug log): the plan role cannot call `HeadBucket` on the log buckets. Its policy allows `s3:ListBucket` only on the state bucket (plus `s3:GetBucket*`, `s3:GetEncryptionConfiguration`, `s3:GetLifecycleConfiguration` on `*`), and `HeadBucket` needs `s3:ListBucket`. In the AWS provider used here (6.68.0, `internal/service/s3/bucket.go`, `findBucket`), a `HeadBucket` error other than 404 is dropped and an "empty result" error is returned, which `retry.NotFound` treats as not-found, so `resourceBucketRead` removes the bucket from state ("has been deleted"). The next plan then proposes to create it and to replace every sub-resource that references it. The apply role has `s3:*` on these buckets, so it would not show this, but it applied the plan the plan role produced.
- Confirmation still needed: a plan run with `TF_LOG=DEBUG` as the plan role, showing the `HeadBucket` response (expected 403).
- Fix proposed in the diagnosis: (1) plan role read access to the log buckets; (2) import the two `aws_s3_bucket` resources only; (3) a `tf-plan` guard against deleting or replacing buckets, KMS keys and tables.
- State after the failed apply (inferred from the log, to be confirmed with `terraform state list`): the two `aws_s3_bucket` resources and their 15 sub-resources are not in state, and the buckets exist in AWS.
- Update (2026-10-10, fix/detective-bucket-state):
  - IAM (applied by hand by the operator, outside Terraform, as for all bootstrap roles): the plan role now has `s3:ListBucket` on the two log buckets, so `HeadBucket` no longer fails during refresh. The operator checked it with the IAM policy simulator (`s3:ListBucket` on both log buckets as the plan role: allowed). The repo copy `docs/bootstrap-policies/plan-policy.json` does not include this grant yet (follow-up; done 2026-10-10 in docs/sec-037-close-and-sync).
  - Import repair: `terraform/modules/detective/main.tf` has `import {}` blocks for `aws_s3_bucket.trail` (`id = local.bucket_name`) and `aws_s3_bucket.access_logs` (`id = local.access_log_bucket_name`). Buckets only; the 15 sub-resources are not imported. No bucket is deleted or re-created.
  - Guard: `tf-plan` in `terraform-apply.yml` has a `destructive plan guard` step after `terraform plan`. It fails, printing the matching lines, when `plan.txt` says an `aws_s3_bucket`, `aws_s3_bucket_*`, `aws_kms_key` or `aws_dynamodb_table` resource `will be destroyed`, `must be replaced` or `will be replaced`. It runs before the plan artifact is uploaded, so `tf-apply` cannot run. No override input; see the runbook `docs/runbooks/detective-controls.md`.
  - Manual restores by the operator in AWS (outside Terraform) after the incident: on both buckets, the bucket-level public access block (all four settings); on the trail bucket, the bucket policy (CloudTrail ACL check, CloudTrail log write, digest write, TLS-only deny); on the access-log bucket, the bucket policy (S3 server access logging delivery, TLS-only deny). Ownership controls, versioning, encryption, lifecycle, notifications and server access logging were not reported as restored.
  - Trail delivery after the restore (operator check): log file delivery and SNS notification delivery confirmed; digest delivery pending (digests are written about once an hour).
  - Next plan, expected and accepted only after review: `will be imported` for the two buckets, possibly with an in-place update of `force_destroy` (import reads it as false, the code sets true); the 15 sub-resources as `will be created`, because they are not in state. Applying those creates writes the Terraform configuration over the hand restores (same content intended); review the policy and public access block diffs before approving `tf-apply`. The guard must pass; any destroy or replace of a bucket resource means stop.
  - Not yet confirmed: that the sub-resource configuration is restored. Do not claim it until a plan after the apply shows no changes for the detective module.
- Update (2026-10-10, chore/detective-remove-imports):
  - The repair apply succeeded. The bucket imports and the GuardDuty detector import ran once in that apply; all three `import {}` blocks were then removed from `terraform/modules/detective/main.tf`. The resources stay in state.
  - The hand-restored public access blocks and bucket policies were replaced by Terraform's versions in that apply.
  - Trail delivery confirmed by the operator at 21:38 America/New_York on 2026-10-10: log files, SNS notifications, CloudWatch Logs and digest files.
  - The `data "aws_guardduty_detector" "existing"` lookup in `terraform/main.tf` and the module's `guardduty_detector_id` variable remain (now unused by the module); remove them only when the detector is no longer managed (runbook).
- Verification (2026-10-10, about 22:00 America/New_York):
  - Apply ran from `main`, including the import block removal and the fail-closed destructive plan guard. Run ID: not recorded.
  - Plan after that apply: one cosmetic in-place update to `module.detective.aws_cloudtrail.this` (`sns_topic_name`, topic name in code versus topic ARN read back). No creates or destroys in any detective resource. Accepted as provider drift; it does not change delivery.
  - Trail delivery confirmed by the operator at 22:01: log files, SNS notifications, CloudWatch Logs and digests succeeding.
  - The hand-restored bucket policies and public access blocks were replaced by Terraform's versions.
  - `docs/bootstrap-policies/plan-policy.json` now has the log-bucket grants the plan role was given by hand (`LogBucketRefreshReads`, `LogBucketHead`; docs/sec-037-close-and-sync).
  - Follow-ups: set `sns_topic_name` on `aws_cloudtrail.this` in the form the provider reads back, so the cosmetic update stops; remove the `guardduty_detector_id` lookup and variable when the detector is no longer managed; confirm the next plan still shows only this single cosmetic change.
- GuardDuty evidence (operator-verified, 2026-10-11):
  - Three GuardDuty findings, all severity Low, dated 2026-10-10 between 15:19 and 15:25 America/New_York. They are historical and describe the incident window, not the current state.
    - `Policy:S3/BucketBlockPublicAccessDisabled` on the trail bucket.
    - `Policy:S3/BucketBlockPublicAccessDisabled` on the access-log bucket.
    - `Stealth:S3/ServerAccessLoggingDisabled` on the trail bucket.
  - Actor: the apply role through GitHub Actions (`AssumedRole`, session name `GitHubActions`), calling `DeleteBucketPublicAccessBlock` and `PutBucketLogging`. This matches the apply that removed the sub-resources.
  - Effective permission: `NOT_PUBLIC` for all three findings.
  - Current state: the public access blocks on both log buckets and server access logging on the trail bucket are in place, restored by the repair apply. Operator-confirmed at 2026-10-11, console check.
  - The findings are retained in GuardDuty as history and are not archived.
- After: apply succeeded, delivery confirmed, plan shows only the accepted `sns_topic_name` drift.
- Outcome: closed (2026-10-10). The `sns_topic_name` drift is accepted and tracked as a follow-up.
- Control area: change control, access control, audit logging

### SEC-038: Monthly budget scoped to the project cost allocation tag
- Date / PR: 2026-10-11 / chore/budget-project-scope
- Source: the Prowler triage (`docs/security/prowler-triage.md`) showed that the AWS account is shared with other teams' workloads.
- Risk: the $75 budget had no cost filter, so it measured the whole shared account. Its alerts reflected other teams' spend, not this project's, and could fire or stay silent for reasons unrelated to the stack.
- Before: `aws_budgets_budget` in `terraform/modules/budget` with no `cost_filter`.
- Fix: a `cost_filter` `TagKeyValue` = `user:Project$cloudbatch818`, built from the new module variables `cost_tag_key` (default `Project`) and `cost_tag_value` (default `cloudbatch818`). The $75 limit, the `MONTHLY` period, the three actual-spend notifications (50%, 80%, 100%) and the 100% forecast notification are unchanged. In the 2026-10-10 Prowler scan, only this project's resources carry `Project=cloudbatch818`. Prerequisites and checks: `docs/runbooks/budget.md`.
- Residual: the filter counts only tagged spend. ALBs created by the Load Balancer Controller and Fargate pod compute carry no `Project` tag in this code, so the scoped figure is a lower bound. Follow-up: set default tags on the controller's ALBs.
- After: `terraform fmt -check` and `terraform validate` pass; Checkov 3.3.26 on `terraform/modules/budget` has no applicable check (0 passed, 0 failed). Not applied yet. The `Project` cost allocation tag must be activated in Billing (management account if this is an Organization member), which can take up to 24 hours; a $0 scoped spend right after the apply is expected.
- Update (2026-10-11, operator-confirmed):
  - The scope filter was applied on 2026-10-11.
  - The `Project` cost allocation tag is active in Billing. The management account activated it, because this account is an Organization member.
  - October 2026 tagged spend is $9.80 of $75. This is a lower bound: untagged load balancers and Fargate cost are excluded.
  - The alert recipient is still unverified. The operator identity lacks permission to view the budget's notification settings.
- Note (2026-10-12): the ALB `Project` tag landed in PR #56 (commit `5e10018`); see SEC-041. The Residual and Update lines above are the 2026-10-11 state and are kept as written. The `docs/runbooks/budget.md` named in the Fix line moved into `docs/cost/budget.md` in PR #58.
- Outcome: open. Close when the scoped spend has been checked against Cost Explorer filtered on the tag, and delivery to the alert recipient is verified.
- Control area: cost control, monitoring

### SEC-039: v2 lab app: key kept in memory only, synthetic patient fields, vendored three.js
- Date / PR: 2026-10-12 / app/v2 (branch only, not merged, Terraform not applied)
- Source: a finding in the v1 page and a feature change. A real-browser check of the v1 page (Chromium in Playwright 1.49.1) showed the API key stored in `sessionStorage` after login. The v2 change also adds patient display fields, a generator, a skill-tree page and one vendored library (three.js).
- Risk: (1) a key in `sessionStorage` is readable by any script on the page and survives reloads of the tab; the data is synthetic, but the pattern is wrong for real data. (2) New fields could be seeded without the synthetic mark. (3) A vendored library is not covered by Trivy (it reads lockfiles), Sonar (`app/src` and `terraform` only), CodeQL (Python and Actions) or Dependabot, so it has to be pinned, hashed and reviewed by hand.
- Before: `evidence/security/browser/before/` (v1 page: key found in `sessionStorage`, no synthetic banner; FAIL), `evidence/security/pytest/before/` (16 tests, ruff clean), `evidence/security/checkov/before/v2-app/`, `evidence/security/trivy/before/v2-app/`, `evidence/security/terraform/before/`.
- Fix:
  - Key: `app/static/session.js` keeps the key in a closure only. It sends it in the `x-api-key` header to `/patients` routes, never stores it (no storage, cookie, URL or DOM), and sends `credentials: "omit"`. A key-entry gate hides the data until the API accepts the key. Every view carries a "SYNTHETIC DATA, not clinical advice" banner.
  - Data: `app/src/models.py` gains height, weight, blood type, conditions, an illustrative risk band, status, ward and `data_classification`, with ranges, a height and weight plausibility check, and a rule that `data_classification` can only be `synthetic`. The new fields are optional so the API still works against a table seeded before this change. `app/tools/generate_patients.py` is seeded and reproducible (the same file on Python 3.12 and 3.13); it writes `app/data/patients.json`, which Terraform seeds from.
  - Terraform (`terraform/modules/dynamodb`): numbers and a list type for the new fields, the whole record still inside `sensitive()` (SEC-025), and a precondition that stops the plan if a seed record is not marked synthetic. No plan or apply was run.
  - Page: `app/static/` skill tree with three.js 0.186.1 (MIT), vendored unmodified in `app/static/vendor/three/` with the npm integrity hash and file hashes in `VERSION.txt`; a test fails if the files change. No CDN and no change to the Content Security Policy (a test asserts the exact string). `.gitattributes` stops line-ending conversion of the vendored files.
- After: `evidence/security/pytest/after/` (60 passed, 1 skipped; 13 Node tests passed; ruff clean), `evidence/security/browser/after/` (38 of 38 checks in a real browser at 375px and 1280px: storage and cookies empty, no key in any URL, no Content Security Policy violation, no horizontal scroll), `evidence/security/checkov/after/v2-app/` (0 failed), `evidence/security/trivy/after/v2-app/` (0 findings), `evidence/security/terraform/after/` (fmt and validate pass).
- Expected plan (not run): 30 `aws_dynamodb_table_item.seed[...]` updated in place (the item body changes; ids P001 to P030 are unchanged), no creates, no deletes, no replacements, no change to the table. A "will be destroyed" or "must be replaced" on any item or on the table is a stop. The destructive plan guard covers tables but not table items, so read the plan.
- Rollout order: deploy the v2 image first (merge to `main`, `cd.yml`), then run the infra workflow to seed. The v1 model rejects unknown fields, so v1 pods would fail on `/patients` once the table holds the new fields.
- Not verified: the Terraform plan and the in-place update behaviour (provider schema not checked, no plan run); other browsers than Chromium; real GPU rendering; screen readers; Dependabot does not track the vendored three.js, so a version bump is a manual task. The risk bands are an illustrative formula, not clinical advice.
- Note (2026-10-12): the tested commit was `db14812`; the Sonar test fix is `a7925a0` (PR #52, merged).
- Outcome: open (code complete on the branch; close after review, merge, deploy, the infra seed run and a plan that matches the expectation above)
- Control area: secrets management, data protection, supply chain

### SEC-040: v2.1 patient card, honest status display and more synthetic fields
- Date / PR: 2026-10-12 / app/v2-1 (PR into `dev`, not merged; Terraform not applied)
- Source: review of the live v2 page, where every patient showed "watch". The seed on `main` (1b93780) has 12 watch, 9 stable and 9 review. The v2 page turned a missing status into "watch" (`app/static/layout.js` and `app/static/app.js` on `main`), so a table that still holds v1 records (no status field) looks like an all-"watch" dataset. That the live table still holds v1 records is inferred from the symptom and was not checked in AWS. The same change makes the view usable (a patient card) and adds more synthetic fields.
- Risk: (1) the page implied a status signal that did not exist: a missing value was shown as a real one. (2) New fields could carry identifiers or free text. (3) A card and label UI could widen the trust surface (storage, URLs, inline styles against the Content Security Policy).
- Before: `evidence/security/browser/before/v2-1/` (the same real-browser check on `main`: 33 passed, 31 failed; no card, no keyboard path, no legend, and v1-shaped records counted and shown as "watch"), `evidence/security/pytest/before/v2-1/` (60 passed, 13 Node tests, ruff clean), `evidence/security/checkov/before/v2-1/`, `evidence/security/trivy/before/v2-1/`, `evidence/security/terraform/before/v2-1/`.
- Fix:
  - Status: a missing or unknown status shows "not recorded" in a neutral grey and is never counted or shown as "watch". When every record has the same status, or none has one, the page says "status is a placeholder in this dataset". This is computed from the data; no rule was added (`app/static/view-model.js`, `app/static/layout.js`).
  - View: a native `<dialog>` card with the full record opens by click or tap on a node or a list row, or by keyboard (Enter on a row; arrow keys and Enter on the tree). Escape, a labelled Close button and a backdrop click close it, and focus returns to the row or the tree. Attribute and risk-band hub nodes are gone: the graph holds the registry hub and one branch per patient, grouped by risk band. One DOM label shows on hover, focus or selection, positioned through CSSOM, which the Content Security Policy allows (no inline `style` attribute). A one-line legend explains the hub, the branches, the colours and that risk bands are illustrative.
  - Data: optional fields with range, allowlist, size and duplicate checks in `app/src/models.py`: blood pressure (pair check), heart rate, temperature (one decimal), HbA1c, eGFR, medications and allergies (allowlists; an allergy may not also be a medication), last and next visit (order checked), care team (role names only) and a note (fixed templates; `@`, URLs and runs of 5 or more digits are rejected). No identifier-like field exists (a test checks the model and the seed). Lab and medicine links to conditions live only in the generator, not in the model.
  - Generator: the new fields come from a second seeded stream, so every existing value is byte-identical (0 lines removed, 620 added; `evidence/security/pytest/after/v2-1/seed-diff.txt`). The output is the same on Python 3.12 and 3.13.
  - Terraform: only the attribute defaults in `terraform/modules/dynamodb/variables.tf` changed (numbers and lists). `main.tf` is unchanged: the whole record stays inside `sensitive()` (SEC-025) and the precondition that stops the plan on an unmarked record stays (SEC-039).
  - Trust surface: the Content Security Policy string is unchanged (exact-string test), no route was added (still read-only), no runtime dependency or CDN script was added, and the API key stays in memory only.
- After: `evidence/security/browser/after/v2-1/` (70 of 70 checks at 375px and 1280px: card by mouse, keyboard and Escape, focus return, backdrop close, at most one label and inside the tree, no horizontal scroll, no Content Security Policy violation, no key in storage, cookies or URLs, placeholder note on v1-shaped records), `evidence/security/pytest/after/v2-1/` (124 passed, 1 skipped; 19 Node tests; ruff clean), `evidence/security/checkov/after/v2-1/` (0 failed), `evidence/security/trivy/after/v2-1/` (0 findings), `evidence/security/terraform/after/v2-1/` (fmt and validate pass).
- Expected plan (not run): the 30 `aws_dynamodb_table_item.seed[...]` updated in place with the new attributes; nothing created, destroyed or replaced; no change to the table. Read the plan before approving: the destructive plan guard does not cover table items.
- Not verified: the Terraform plan; the state of the live table; browsers other than Chromium; real GPU rendering; screen readers.
- Note (2026-10-12): PR #54 was merged to `dev` and then to `main` (`3eb5795` on `main` via #54; #55 and #57 carried it forward). The "not merged" in the Date / PR line is the state when the entry was written.
- Outcome: open (code complete on the branch; close after review, merge, deploy, the infra seed run and a plan that matches the expectation above)
- Control area: data integrity, data protection, secrets management

### SEC-041: ALB carries the Project cost allocation tag
- Date / PR: 2026-10-12 / PR #56 (commit `5e10018`)
- Source: SEC-038 Residual: the ALB created by the Load Balancer Controller carried no `Project` tag, so the scoped budget could not count it.
- Risk: spend on the ALB was outside the budget filter, so the scoped figure under-reported project cost.
- Before: no ALB tag was set (SEC-038 Residual).
- Fix: the Helm chart sets the annotation `alb.ingress.kubernetes.io/tags` with the value `cloudbatch818` for the `Project` key. This satisfies the budget filter `Project$cloudbatch818` (SEC-038), which also matches `PROJECT_NAME` = `cloudbatch818`.
- After: the operator checked the ALB tag on 2026-10-12. This was not verified from the repo.
- Not verified: Fargate cost attribution (check Cost Explorer); the tag lookup itself is not in the repo yet.
- Evidence (2026-10-13):
  - Ingress: `healthcare-api` in the namespaces `cloudbatch818-healthcare-dev` and `cloudbatch818-healthcare-prod`.
  - Both ALBs carry `Project=cloudbatch818` (checked in the EC2 console, Tags tab, 2026-10-13).
  - Both ALBs were created 2026-10-09. No recreation since, so the tag change was applied in place.
  - Cost Explorer: the ELB line first appears 2026-10-12. Reconciliation pending; see the watch items in `docs/cost/budget.md`.
  - Raw CLI output: held outside the repo; not committed.
- Outcome: open (close when the tag lookup evidence is added and the scoped spend is checked against Cost Explorer)
- Control area: cost control, monitoring
