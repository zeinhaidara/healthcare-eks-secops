# Security controls

Controls are HIPAA-aligned, not HIPAA compliant. Data is synthetic only. Verified against the repository on 2026-10-12 (branch `docs/control-updates`, from `dev`, since merged). Every row names its source as `file:line`.

## How to read this

This page lists what protects the system and how we know. Read it row by row.

- **Status** says what state the control is in:
  - **Live**: it exists in the repository and a record shows it works (see Evidence).
  - **Manual**: someone set it by hand in GitHub or AWS, outside the code. It is described in [bootstrap.md](../bootstrap.md).
  - **Planned**: not built yet. Nothing here claims it protects anything today.
  - **Not verified**: it is described somewhere, but I could not confirm it. The reason is in the row.
- **ID** links the control to our records. A **SEC** entry is a change we made and logged in [improvement-log.md](improvement-log.md). An **EXC** entry is a risk we knowingly accepted, with an owner and an expiry date, in [exceptions-register.md](exceptions-register.md).
- **Evidence** is where to look for proof. It is one of: a saved scan under `evidence/security/`; a result recorded in a SEC entry (cited by line in `improvement-log.md`); or, for automated checks, the fact that the check is required on every pull request (confirmed in the live `main` ruleset). A control is **Live** only when one of these exists. Code that passes a scan shows the code is correct; it does not show a resource is running right now. The stack is destroyed after each working session ([cost/budget.md](../cost/budget.md)), and whether it is up today was not checked.
- **Source** is the file and line that implements the control. Use it to check any claim yourself.

Where the page disagrees with another document, the row says so in the open. The list of open discrepancies and unverified claims is at the end.

## 1. Repo layer

| Control | Status | ID | Evidence | Source |
|---|---|---|---|---|
| Branch flow: `feature/*` into `dev`, `dev` into `main`, merge commits only | Manual | SEC-009, EXC-003 | Live rulesets read 2026-10-12 (read-only): `main` allows only the `merge` method | `docs/bootstrap.md:42`; ruleset `main` |
| `main` ruleset: pull request required with 0 approvals, no force push, no deletion, 10 required checks | Manual | SEC-009, SEC-010, EXC-003 | Live ruleset read 2026-10-12. Required checks: `app-build`, `app-checkov`, `app-image-scan`, `app-test-lint`, `app-trivy`, `tf-checkov`, `tf-validate`, `sonar`, `codeql`, `CodeQL` | `docs/bootstrap.md:42` (lists 7 checks). Discrepancy 1 and 2 below |
| `dev` ruleset: pull request required with 0 approvals, no force push, no deletion | Manual | EXC-003 | Live ruleset read 2026-10-12 | Not described in `docs/bootstrap.md`. Discrepancy 3 below |
| Code ownership file | Live | none | The file itself; the rulesets do not require code-owner review, so it names owners but does not force review | `.github/CODEOWNERS:1-5` |
| Dependabot: weekly updates for pip, Docker and GitHub Actions | Live | none | The config file. Not verified: whether update PRs are being opened (no PR history checked) | `.github/dependabot.yml:3-14` |
| No secrets in git: env files, keys, local instructions, Prowler output and the local deck are ignored; Trivy scans for committed secrets | Live | SEC-000, SEC-012 | `evidence/security/trivy/` | `.gitignore:2,19-22,41,44`; `security/trivy/trivy.yaml` |
| Every change and every accepted risk is recorded | Live | SEC-000 to SEC-041, EXC-001 to EXC-014 | The two registers themselves | `docs/security/improvement-log.md`, `docs/security/exceptions-register.md` |

## 2. PR gate (no AWS access, no OIDC)

`ci.yml` runs on pull requests to `main` or `dev` and on pushes to `dev` and `main`, with no path filter so every required check always reports (`.github/workflows/ci.yml:6-10`). Default token is read-only (`ci.yml:12-13`). The file holds no AWS credentials step (searched: zero `role-to-assume` or `configure-aws-credentials`).

| Check (job name) | Status | ID | Evidence | Source |
|---|---|---|---|---|
| `app-test-lint`: pytest with coverage, ruff check, ruff format | Live | SEC-014 | Required check; `evidence/security/sonar/after/` (100% coverage on new code) | `ci.yml:16-39` |
| `lambda-test`: tests for the rotation Lambda (AWS calls faked) | Live | SEC-013, SEC-014 | Required input to `sonar` | `ci.yml:41-60` |
| `app-trivy`: dependencies and secrets, fails on fixable HIGH or CRITICAL | Live | SEC-012 | `evidence/security/trivy/` | `ci.yml:62-86` (severity `:76`, ignore-unfixed `:77`, exit code `:78`) |
| `app-build`, `app-image-scan`: build the image locally and scan it; nothing is pushed | Live | SEC-012 | `evidence/security/trivy/after/ci-image/` | `ci.yml:88-134` |
| `app-checkov`: Dockerfile and workflows; any failed check fails the job | Live | SEC-000 | `evidence/security/checkov/before/`, `evidence/security/checkov/after/app-workflows/` (48 + 220 passed, 0 failed) | `ci.yml:136-161`; `security/checkov/app.yaml` |
| `tf-validate`: `fmt -check`, `init -backend=false`, `validate` (Terraform 1.16.5) | Live | none | Required check on every PR | `ci.yml:163-176`, version `:170` |
| `tf-checkov`: Terraform; any failed check fails the job | Live | SEC-001, SEC-002, SEC-005, EXC-001 to EXC-014 | `evidence/security/checkov/before/terraform/` (62 passed, 6 failed, 2026-10-08), `evidence/security/checkov/after/detective/full-final/` (355 passed, 0 failed, 15 skipped) | `ci.yml:178-201`; `security/checkov/terraform.yaml` |
| `codeql`: Python and GitHub Actions, security-extended; fails on security severity 7.0 or more | Live | SEC-007 | `evidence/security/codeql/` (0 findings) | `ci.yml:205-229` (languages `:215`, gate `:228-229`) |
| `sonar`: SonarCloud quality gate, waited on for pull requests only | Live | SEC-008, SEC-015 | `evidence/security/sonar/` | `ci.yml:231-269` (gate wait `:269`) |
| `gitleaks`: secrets scan over the full git history on every pull request and push (`--log-opts=--all`), default rules plus the repo config; findings fail the job. It covers merge commits and the whole push range: the commits a release merge brings in on its second parent are scanned, which the earlier `gitleaks-action` setup (`--no-merges --first-parent`) skipped | Planned | none | Proved in a throwaway repo: the old range found 0 leaks and the new one found the planted key (rule `aws-access-token`). Local full-history scan: 104 commits, 20 hits, all `generic-api-key` false positives in three Trivy evidence files, allowlisted in `.gitleaks.toml` with the reason. Flip to Live after the first green CI run | `ci.yml:276-298` (CLI v8.30.1 pinned by SHA-256 `:282-283`, scan `:297-298`); config `.gitleaks.toml` |
| `tflint` (`security-scans.yml`): both Terraform roots and every module, terraform and AWS rulesets; report only | Live | none | Runs on every PR and push to `dev`. 0 issues once each module has a `versions.tf` (was 23: `terraform_required_providers` 12, `terraform_required_version` 11) | `security-scans.yml`, `terraform/.tflint.hcl`, `terraform/modules/*/versions.tf` |
| `kubescape` (`security-scans.yml`): rendered `healthcare-api` and Argo CD charts, NSA and CIS `cis-v1.12.0`, files only; report only | Live | none | Runs on every PR and push to `dev`. Argo CD hardened in `values/argocd.yaml` (NSA failed controls 8 to 5). Open findings and why: `docs/runbooks/security-scans.md`, Open Kubescape findings | `security-scans.yml`, `terraform/cluster-addons/values/argocd.yaml` |
| `pip-audit` (`security-scans.yml`): `app/requirements.txt`; report only. No npm audit: there is no frontend package file | Planned | none | First run on the PR that adds it | `security-scans.yml` |

Supporting rules:
- All 63 `uses:` lines in the four workflows are pinned by commit SHA (searched: none unpinned).
- Reports are uploaded as artifacts with 90-day retention (`ci.yml:39,60,86,134,161,201,226`). They expire; the saved copies are under `evidence/security/`.
- Every skip needs a register entry with owner and expiry (EXC-001 to EXC-014). All 14 inline `checkov:skip` comments map to one; 7 of the 14 give only the EXC ID in the comment, not the owner and expiry. See discrepancy 6.

## 3. Pipeline layer

| Control | Status | ID | Evidence | Source |
|---|---|---|---|---|
| No stored AWS keys in CI: GitHub OIDC only, one role per purpose | Live | SEC-011 | `docs/bootstrap.md:19`. Not verified: the role trust policies (created by hand, not in the repo) | `cd.yml:78,114,196`; `terraform-apply.yml`; `terraform-destroy.yml:43` |
| Terraform runs only by manual dispatch with no inputs; one run at a time | Live | SEC-004 | `evidence/security/checkov/after/` (CKV_GHA_7) | `terraform-apply.yml:6,11-12`; `terraform-destroy.yml:5,10-11` |
| `tf-plan` under the read-only plan role; `tf-apply` behind the `infra` environment; add-ons plan and apply behind a second `infra` approval | Live | EXC-004, EXC-006 | SEC-037 verification (apply ran from `main`, 2026-10-10) | `terraform-apply.yml:33,43,97-101,138-142,179-183` |
| `tf-apply` applies the exact plan file and the exact Lambda zip that `tf-plan` built | Live | SEC-016 | SEC-016 entry | `terraform-apply.yml:64-67,87-93,123-124` |
| Destructive plan guard: `tf-plan` fails on a delete or replace of an S3 bucket or bucket setting, KMS key or DynamoDB table; fails closed on a missing plan or grep error | Live | SEC-037 | `improvement-log.md:433-475`. Not verified: the guard has not been seen blocking a real plan (only the local test run in the session) | `terraform-apply.yml:71-86` |
| Destroy behind its own `infra-destroy` approval | Live | none | The workflow | `terraform-destroy.yml:32-43` |
| `cd.yml` on a push to `dev` that changes `app/`: build, scan, push, then a commit on `dev` that sets the image tag and digest. CI never runs Helm or kubectl against the cluster; Argo CD deploys from Git | Planned | SEC-011, SEC-031 | Code is in the PR that adds it; not applied or run. The earlier deploy jobs had SEC-031 and SEC-033 evidence, which does not carry over | `cd.yml:6-13`; `docs/runbooks/gitops-deploy.md` |
| GitHub Environments `infra`, `infra-destroy`, `dev`, `prod`: one required reviewer (the maintainer), self-review allowed, repo admins can bypass; `prod`, `infra`, `infra-destroy` deploy from `main` only, `dev` from protected branches (`dev`, `main`) | Manual | EXC-003 | Settings read 2026-10-11 (read-only), recorded in `talk/presentation-facts.md:38-40`. Discrepancy 4 below | `docs/bootstrap.md:19` |

CI roles (all created by hand; policies are copies kept in `docs/bootstrap-policies/`):

| Role | Used by | Access | Status | Evidence and source |
|---|---|---|---|---|
| plan | `tf-plan` | Read-only; state lock file only | Manual | `plan-policy.json`; trust includes `pull_request` (EXC-004, SEC-011). Trust policy not verified: not in the repo |
| apply | `tf-apply`, add-ons jobs, destroy | Write, scoped to project resources; EKS cluster admin | Manual | `apply-policy.json`; EXC-006, SEC-019 |
| ecr-push | `cd.yml` job `push` | Push to the project ECR repository | Manual | Not verified: no policy file for this role in the repo (`docs/bootstrap-policies/` has plan, apply, deploy-dev, deploy-prod only) |
| deploy-dev, deploy-prod | no longer used by `cd.yml` (kept until removed) | `AmazonEKSEditPolicy` on one namespace each; describe and list calls in AWS | Manual | `deploy-dev-policy.json`, `deploy-prod-policy.json`; `terraform/main.tf:92-100`; SEC-019. Not verified: which role each environment's `AWS_ROLE_ARN` variable holds (GitHub variables, values not read) |

## 4. Dependencies and artifacts

| Control | Status | ID | Evidence | Source |
|---|---|---|---|---|
| Tool versions pinned: Trivy v0.75.0, Checkov 3.3.26, Terraform 1.16.5, Helm v4.3.0, Python packages with `==` | Live | SEC-000, SEC-012 | `evidence/security/trivy/`, `evidence/security/checkov/` record the versions | `ci.yml:70,118,144,170,186`; `cd.yml:41,118,200`; `app/requirements.txt:1-4`; `app/requirements-dev.txt:2-5` |
| Terraform providers constrained (`~>`) with lock files committed | Live | none | The lock files | `terraform/providers.tf:7,11`; `terraform/.terraform.lock.hcl`; `terraform/cluster-addons/.terraform.lock.hcl` |
| Base image pinned by digest; image runs as non-root user 10001 | Live | SEC-030 | SEC-030 entry; `app/Dockerfile` | `app/Dockerfile:1,6,8,14` |
| Image scanned before it is pushed; the scanned image is the one pushed | Live | SEC-012, SEC-031 | `evidence/security/trivy/after/ci-image/` | `cd.yml:27-63` (scan `:38-52`; build job holds no credentials, `:32`) |
| Images in ECR: immutable tags, scan on push, KMS encryption, lifecycle rules | Live | none | `evidence/security/checkov/after/detective/full-final/` | `terraform/modules/ecr/main.tf:3,7,11-12,16-38` |
| Deploys pin the image digest, not a tag: `cd.yml` writes the digest into the values files and the chart pulls by digest | Planned | SEC-031 | Not run yet | `cd.yml:98-104,125-132`; `helm/healthcare-api/templates/deployment.yaml:40` |
| Dependency updates proposed weekly | Live | none | See Dependabot row in section 1 | `.github/dependabot.yml:3-14` |

## 5. Deploy layer (chart, cluster and application)

| Control | Status | ID | Evidence | Source |
|---|---|---|---|---|
| Deploy through Argo CD: dev syncs automatically with prune and self-heal; prod syncs only when approved in Argo CD; an `AppProject` limits the source repo, the two namespaces and the object kinds, with no cluster-scoped objects. Rollback is a `git revert` of the image tag. The old `--rollback-on-failure` and the cluster smoke test are gone, and CI does not wait for Argo health | Planned | none | Code is in the PR that adds it; not applied | `terraform/cluster-addons/charts/argocd-apps/`; `docs/runbooks/gitops-deploy.md` |
| Manual rollback script and runbook | Planned | none | Neither exists. Rollback today is a `git revert` through Git (`docs/runbooks/gitops-deploy.md`, Roll back) | none |
| Pod hardening: non-root, read-only root filesystem, no privilege escalation, all capabilities dropped, default seccomp profile, no service account token | Live | SEC-030 | SEC-030 entry; pods admitted under `restricted` on dev and prod (SEC-032 verification, 2026-10-09) | `helm/healthcare-api/templates/deployment.yaml:31-37,68-79` |
| Pod Security `restricted` enforced, audited and warned on both app namespaces | Live | SEC-030, SEC-032 | SEC-032 entry | `terraform/cluster-addons/main.tf:13-25` |
| Pod Security rejection test (privileged pod refused, error saved) | Planned | none | `evidence/security/podsecurity/` does not exist | none |
| Network isolation of pods: per-namespace security groups, attached by `SecurityGroupPolicy`; verified on dev and prod pods | Live | SEC-021, SEC-032, EXC-007 (closed) | `improvement-log.md:355-357` | `terraform/cluster-addons/main.tf:63-108` |
| Kubernetes NetworkPolicy (default deny plus allow rules) | Not enforced | SEC-021 | Written in the chart for intent only; the network policy agent does not run on Fargate | `helm/healthcare-api/values.yaml:74-80`; `helm/healthcare-api/templates/networkpolicy.yaml:2` |
| Pod disruption budget (minimum 1 available) | Live | none | The chart template; not verified on a running cluster | `helm/healthcare-api/values.yaml:70-72`; `helm/healthcare-api/templates/poddisruptionbudget.yaml` |
| Argo CD reads this repo as a GitHub App (Contents and Metadata, read-only), not an SSH key. The private key is in Secrets Manager and is synced into the `argocd` namespace by External Secrets, whose role can read only that one secret | Planned | none | Code is in the PR that adds it; not applied, so there is no evidence yet. The operator's role has no wildcard and no static keys | `terraform/cluster-addons/main.tf` (`irsa_external_secrets`, `argocd_repo_secret`); `terraform/cluster-addons/charts/argocd-repo-secret/` |
| Horizontal autoscaling | Planned | none | Chart supports it but it is off: needs metrics-server, which is not installed | `helm/healthcare-api/values.yaml:63-67` |
| HTTPS only: public ALB per environment, port 80 redirects to 443, ACM certificate | Live | SEC-033 | SEC-033 entry (HTTPS check, `/health` and `/ready` return 200) | `helm/healthcare-api/templates/ingress.yaml:10-16`; `terraform/main.tf:111-116` |
| Public EKS API endpoint (0.0.0.0/0 and private), access by IAM access entries only | Live | SEC-018, EXC-005 | SEC-018 entry | `terraform/modules/eks/main.tf:39-40,51-54,60-61` |
| Application: read-only routes, `x-api-key` compared in constant time, 403 without a valid key | Live | SEC-022 | `app/tests/test_main.py` (`test_patients_requires_key`, `test_invalid_key_rejected`, `test_write_methods_are_not_allowed`) | `app/src/main.py:109-119` (compare `:116`) |
| Application: Content Security Policy with no inline scripts and `form-action 'self'`, plus `nosniff` and `no-store` | Live | none | `app/tests/test_main.py` (`test_index_served_with_csp`), `app/tests/test_page_security.py` (`test_security_headers_are_on_every_kind_of_response`) | `app/src/main.py:21-24,100-102` |
| Application: `Strict-Transport-Security: max-age=31536000; includeSubDomains` (no preload) | Live | none | `app/tests/test_page_security.py` (`test_security_headers_are_on_every_kind_of_response`) | `app/src/main.py:29,103` |
| Application: `Permissions-Policy` denies camera, microphone, geolocation, payment and usb | Live | none | `app/tests/test_page_security.py` (`test_security_headers_are_on_every_kind_of_response`) | `app/src/main.py:30,103` |
| Application: `Cross-Origin-Opener-Policy: same-origin` | Live | none | `app/tests/test_page_security.py` (`test_security_headers_are_on_every_kind_of_response`) | `app/src/main.py:31,103` |
| Application: `Cross-Origin-Resource-Policy: same-origin` | Live | none | `app/tests/test_page_security.py` (`test_security_headers_are_on_every_kind_of_response`) | `app/src/main.py:32,103` |
| Application: `Cross-Origin-Embedder-Policy` | Not set (open) | none | The page loads nothing cross-origin (no external URL in the static files, CSP is same-origin only), but `require-corp` was left out until it is checked on the deployed host | none |
| Application: request metadata only in logs, never patient fields | Live | none | Code comment and log formatter; not verified: no test asserts that patient fields are absent from logs | `app/src/main.py:32-36,95` |
| Synthetic data only; the table is tagged `DataClassification = synthetic`. The validation accepts only `synthetic` or `phi`, and `phi` is not set anywhere | Live | SEC-026, EXC-008 | SEC-026 entry | `terraform/modules/dynamodb/main.tf:21`; `terraform/modules/dynamodb/variables.tf:22-30` |

## 6. Infrastructure layer

Nothing below proves the resource is running today; see "How to read this".

| Control | Status | ID | Evidence | Source |
|---|---|---|---|---|
| One KMS key with rotation for the table, secret, ECR, logs and trail | Live | SEC-005, EXC-001 | `evidence/security/checkov/after/detective/full-final/`; Prowler 2026-10-10: the project key passes the rotation and deletion checks (local, see section 7) | `terraform/modules/kms/main.tf:100-103` |
| DynamoDB: KMS encryption, point-in-time recovery, pay per request; the app only reads | Live | SEC-022, SEC-023, SEC-025 | `evidence/security/checkov/after/detective/full-final/` | `terraform/modules/dynamodb/main.tf:3,11-18` |
| Seeded patient values hidden in plan and apply output | Live | SEC-025 | SEC-025 entry | `terraform/modules/dynamodb/main.tf:37-40` (`sensitive()` on the item body) |
| API key in Secrets Manager (KMS, value set by hand, not in Terraform), rotated every 30 days by a Lambda in the VPC with a dead-letter queue | Live | SEC-003, SEC-027, SEC-034, EXC-002, EXC-009 | SEC-003 and SEC-027 entries; `evidence/security/checkov/after/fix-lambda-eni-role/` | `terraform/modules/secrets/main.tf:4,14-15`; `terraform/modules/secrets/variables.tf:22`; `terraform/modules/secret-rotation/main.tf:16,21,142-159` |
| Pods read only the table, the secret and the project key, through IRSA | Live | none | `evidence/security/checkov/after/detective/full-final/` (latest full Terraform scan) | `terraform/main.tf:119-150` |
| VPC with pinned availability zones, private subnets for pods, one NAT gateway, no public IP on launch | Live | SEC-001 | `evidence/security/checkov/after/terraform-hardening/` | `terraform/modules/network/main.tf:2,29-51,63` |
| VPC flow logs to KMS-encrypted CloudWatch Logs, **365 days** retention (the module default is 30; the root passes 365) | Live | SEC-002 | `evidence/security/checkov/after/terraform-hardening/` | `terraform/modules/network/main.tf:109-112,150-152`; `terraform/variables.tf:56-59`; `terraform/main.tf:22`; module default `terraform/modules/network/variables.tf:42-45` |
| EKS on Fargate only (no node groups); secrets encryption; control-plane logs (api, audit, authenticator, controllerManager, scheduler); API-mode authentication with no creator admin | Live | SEC-018, SEC-019 | `evidence/security/checkov/after/terraform-eks/` | `terraform/modules/eks/main.tf:7,44,51-54,65-66,102` |
| Apply role is cluster admin, used only behind the `infra` and `infra-destroy` approvals | Live | EXC-006, SEC-019 | `exceptions-register.md` row EXC-006 | `terraform/main.tf:102-106` |
| Operator break-glass: the operator IAM user can read (get, list, watch) everything in the `argocd` namespace, Secrets included, through `AmazonEKSAdminViewPolicy` scoped to that one namespace. It sits on top of the cluster-wide view policy, grants no write, and is removed by deleting one resource | Planned | none | Code is in the PR that adds it; not applied, so there is no evidence yet. How to use and remove it: `docs/runbooks/eks-operator-import.md` | `terraform/main.tf:195-210` |
| Operator access: read-only EKS view policy at cluster scope, managed in Terraform | Live | SEC-029 | SEC-029 entry. Residual risk: the operator IAM user has a long-lived access key and no MFA (Prowler triage N2) | `terraform/main.tf:173-190` |
| Terraform state encrypted with AES256, not the project key | Manual | EXC-008, SEC-026 | `exceptions-register.md` row EXC-008. Not verified: the state bucket is created by hand and not in the repo | none |
| Plan and apply policies avoid `Action: *`; remaining wildcards are listed with owner and Phase 7 task | Live | EXC-001, EXC-009 | `docs/bootstrap-policies/README.md` wildcard table | `docs/bootstrap-policies/` |

## 7. Detection and audit

| Control | Status | ID | Evidence | Source |
|---|---|---|---|---|
| CloudTrail: **single region (us-east-2)**, log file validation, KMS, delivery to S3, CloudWatch Logs and SNS. IAM and STS events that originate in us-east-1 are **not** captured until [EXC-010](exceptions-register.md) is closed | Live | SEC-035, SEC-036, SEC-037, EXC-010 | `improvement-log.md:461` (delivery of logs, SNS, CloudWatch Logs and digests confirmed 2026-10-10 22:01) | `terraform/modules/detective/main.tf:188-198` (multi-region off `:192`, validation `:194`) |
| CloudTrail bucket and access-log bucket: private, versioned, TLS only; access-log bucket uses SSE-S3; `force_destroy` on | Live | SEC-036, EXC-012, EXC-013, EXC-014 | `improvement-log.md:465-472` (SEC-037 GuardDuty evidence: public access blocks and logging restored by the apply) | `terraform/modules/detective/main.tf:56-78,317-343` |
| GuardDuty detector with S3 data events and EKS audit logs | Live | SEC-035, EXC-011 | `improvement-log.md:465-472` (SEC-037: three Low findings, 2026-10-10, kept as history) | `terraform/modules/detective/main.tf:36-52` |
| Security Hub with the AWS Foundational Security Best Practices standard | Live | SEC-035 | `improvement-log.md:411`. Control findings need AWS Config, so expect no data until Config exists | `terraform/modules/detective/main.tf:19-28` |
| Alert delivery: the CloudTrail SNS topic has no subscriber | Planned | SEC-037 | `docs/runbooks/detective-controls.md` (known gaps); no `aws_sns_topic_subscription` in Terraform | none |
| Prowler posture scan of the account (2026-10-10, one run, no after run) | Live | none (triage N1 to N8, proposed) | Raw output local only, gitignored: `evidence/security/prowler/`; [prowler-triage.md](prowler-triage.md) | none |
| ZAP API scan of dev (`dast-api.yml`): OpenAPI-driven active scan, weekly, dev only, report only | Planned | none | First scheduled run after release to `main`; artifact `zap_api_scan` | `dast-api.yml` |
| ZAP full scan of dev (`dast-full.yml`): active attack traffic, weekly off-hours, 60-minute timeout, dev only, report only | Planned | none | First scheduled run after release to `main`; artifact `zap_full_scan` | `dast-full.yml` |
| Prowler on a schedule | Not set up | none | No CI setup or CI role exists for Prowler; only the 2026-10-10 manual run (row above). Not built, by decision | none |
| Amazon Inspector | **Planned, not built** | none | No `aws_inspector2` resource in Terraform (searched) | none |
| AWS Config | **Planned, not built** | none | No `aws_config_` resource in Terraform (searched) | none |
| AWS WAF with managed rules and a rate limit | **Planned, not built** | none | No `aws_wafv2` resource in Terraform (searched) | none |
| Alarms with severity and owner, a metric-filter alarm, dashboards | Planned | none | No `aws_cloudwatch_metric_alarm`, `aws_cloudwatch_log_metric_filter` or `aws_cloudwatch_dashboard` in Terraform (searched) | none |
| Incident simulation and runbooks | Planned | none | No simulation run recorded | none |

## 8. Budget

| Control | Status | ID | Evidence | Source |
|---|---|---|---|---|
| Monthly budget of $75 with four alerts (actual spend at 50, 80 and 100 percent, forecast at 100 percent), set in Terraform | Live | SEC-038 | `improvement-log.md` SEC-038 (operator-confirmed 2026-10-11) | `terraform/variables.tf:50-53`; `terraform/main.tf:47-53`; `terraform/modules/budget/main.tf:4,6,15-30`; `terraform/modules/budget/variables.tf:16,22` |
| Budget filtered to the cost tag `Project=cloudbatch818`; the ALB carries the same tag (PR #56; operator-checked 2026-10-12, not verified from the repo); Fargate attribution is not confirmed, so the spend shown may be a lower bound | Live | SEC-038, SEC-041 | SEC-038 update: $9.80 of $75 for October 2026 (operator-confirmed) | `terraform/modules/budget/main.tf:10-13`; `terraform/modules/budget/variables.tf:28,34` |
| Budget alert recipient receives alerts | Not verified | SEC-038 | The operator identity cannot view the notification settings; no alert has been recorded | `terraform/modules/budget/main.tf:15-30` |
| Destroy the stack after every working session | Manual | EXC-013 | `docs/cost/budget.md` rules; whether the stack is up today was not checked | `terraform-destroy.yml` |

## Open discrepancies and claims not verified

Discrepancies between this page's sources (not fixed here, because the other documents are out of scope):

1. **Code scanning rule.** The live `main` ruleset still has a `code_scanning` rule (CodeQL, high or higher). `docs/bootstrap.md:42` and SEC-010 (`improvement-log.md:122-130`) say that requirement was removed.
2. **Required checks.** The live `main` ruleset requires 10 checks, including `app-build`, `app-image-scan` and a second `CodeQL` check. `docs/bootstrap.md:42` lists 7.
3. **`dev` ruleset.** The live `dev` ruleset exists (pull request required, no force push, no deletion). `docs/bootstrap.md` documents only the `main` ruleset.
4. **Environments.** `docs/bootstrap.md:19` says all four environments are limited to `main`. The settings read on 2026-10-11 show `dev` limited to protected branches (`dev` and `main`), and all four have one required reviewer (self-review allowed) and admin bypass on.
5. **Pod Security rejection test.** `DESIGN_PLAN.md` section 13 expects it as before and after evidence; none was saved.
6. **Skip comments.** 7 of 14 inline `checkov:skip` comments (detective module, Lambda ENI statements) give only the EXC ID, not the owner and expiry that `CLAUDE.md` requires in the comment. The register itself is complete.
7. **Apply role is cluster admin (EXC-006, SEC-019).** The apply role holds `AmazonEKSClusterAdminPolicy` at cluster scope (`terraform/main.tf:102-106`). Anyone who can get an `infra` job approved, or who can change a workflow that runs there on `main`, acts as cluster admin: they can read every Secret (the Argo CD admin password and the app API key included), change RBAC and delete workloads. It is accepted and open, with expiry 2027-04-08. Planned fix, not scheduled: give the role only what the jobs need (namespace-scoped policies for the namespaces Terraform manages, and a narrow custom role for the cluster-scoped objects the add-ons root creates), and run the add-ons apply under its own role. This change does not touch the apply role.
8. **Argo CD NetworkPolicy allows ingress from anywhere.** The default NetworkPolicy the Argo CD chart creates for the server in the `argocd` namespace allows ingress from any source. Known gap. Not changed.

Not verified, with the reason:

- EKS secrets encryption (KMS): `encryption_config` is set in code (`terraform/modules/eks/main.tf:65-70`), but no check shows it active on the live cluster. This stays **open**. The GitHub App private key is held in a Kubernetes Secret in `argocd`, so the check matters.
- Role trust policies (plan, apply, ecr-push, deploy-dev, deploy-prod): created by hand, not in the repo.
- Which role each GitHub environment's `AWS_ROLE_ARN` holds: variable values were not read.
- The `ecr-push` role's permissions: no policy file in the repo.
- The Terraform state bucket (AES256, versioning, private): created by hand, not in the repo.
- Whether the stack is currently applied: the stack is destroyed after each session and no live AWS check was made.
- Whether Dependabot opens update PRs: no PR history checked.
- That the pod disruption budget and the HTTPS redirect behave as configured on a running cluster: the repo shows the configuration only.
- Whether patient fields are ever logged: the code logs request metadata only (`app/src/main.py:95`), but no test asserts it.
- The destructive plan guard blocking a real destructive plan: not yet seen in a real run.
- The alert recipient's address and delivery (see section 8).
