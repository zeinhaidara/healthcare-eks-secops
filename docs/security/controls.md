# Security controls

What protects the system, and how we know. Data is synthetic only. No compliance claim is made.

- **Status:** **Live** (in the repo, with evidence), **Manual** (set by hand in GitHub or AWS, see [bootstrap.md](../bootstrap.md)), **Planned** (not built) or **Not enforced**.
- **ID:** SEC entries are logged changes ([improvement-log.md](improvement-log.md)). EXC entries are accepted risks ([exceptions-register.md](exceptions-register.md)).
- **Evidence:** a saved scan under `evidence/security/`, a result in a SEC entry, or a check that runs on every PR. Code that passes a scan does not prove a resource is running today.

## 1. Repo

| Control | Status | ID | Evidence and source |
|---|---|---|---|
| Branch flow `feature/*` to `dev` to `main`, merge commits only | Manual | SEC-009, EXC-003 | `main` and `dev` rulesets |
| `main`: PR with 0 approvals, no force push, no deletion, 10 required checks, CodeQL rule | Manual | SEC-009, SEC-010, EXC-003 | `main` ruleset; list in [bootstrap.md](../bootstrap.md) |
| `dev`: no force push, no deletion; no PR or checks required | Manual | EXC-003 | `dev` ruleset |
| Code owners named (review not required) | Live | none | `.github/CODEOWNERS` |
| Dependabot weekly for pip, Docker and Actions | Live | none | `.github/dependabot.yml` |
| No secrets in Git: ignore rules, Trivy secret scan, gitleaks over full history | Live | SEC-000, SEC-012 | `.gitignore`, `security/trivy/trivy.yaml`, `.gitleaks.toml`; `evidence/security/trivy/` |
| Every change and accepted risk recorded | Live | all | The two registers |

## 2. PR gate (`ci.yml`, no AWS access)

Runs on PRs to `main` and `dev` and pushes to both, with no path filter. The token is read-only. All `uses:` lines are pinned by commit SHA. Every `checkov:skip` maps to an EXC entry.

| Job | Gate | Status | ID | Evidence |
|---|---|---|---|---|
| `app-test-lint`: pytest with coverage, ruff check and format | Fails | Live | SEC-014 | `evidence/security/sonar/after/` |
| `lambda-test`: rotation Lambda tests, AWS faked | Fails | Live | SEC-013 | Input to `sonar` |
| `app-trivy`: dependencies and secrets, fixable HIGH or CRITICAL | Fails | Live | SEC-012 | `evidence/security/trivy/` |
| `app-build`, `app-image-scan`: build and scan the image; nothing pushed | Fails | Live | SEC-012 | `evidence/security/trivy/after/ci-image/` |
| `app-checkov`: Dockerfile and workflows | Fails | Live | SEC-000 | `evidence/security/checkov/after/app-workflows/` |
| `tf-validate`: fmt, init without backend, validate, both roots | Fails | Live | none | Required check |
| `tf-checkov`: Terraform | Fails | Live | SEC-001, SEC-002, SEC-005 | `evidence/security/checkov/after/detective/full-final/` (0 failed, 15 skipped) |
| `codeql`: Python and Actions, security-extended, fails at severity 7.0 | Fails | Live | SEC-007 | `evidence/security/codeql/` |
| `sonar`: SonarCloud gate, waited on for PRs only | Fails | Live | SEC-008, SEC-015 | `evidence/security/sonar/` |
| `gitleaks`: full history including merge parents, CLI pinned by SHA-256 | Fails | Live | none | Green on every PR |
| `securitycontext-check`: no `runAsGroup` without `runAsUser` in rendered charts | Fails | Live | none | `scripts/check_run_as_user.py` |
| `tflint`, `kubescape`, `pip-audit` | Report only | Live | none | [security-scans.md](../runbooks/security-scans.md) |

## 3. Pipeline

| Control | Status | ID | Evidence and source |
|---|---|---|---|
| GitHub OIDC only, one role per purpose, no stored AWS keys | Live | SEC-011 | `cd.yml`, `terraform-*.yml`; trust policies are by hand and not in the repo |
| Terraform only by manual dispatch with no inputs, one run at a time | Live | SEC-004 | `terraform-apply.yml`, `terraform-destroy.yml` |
| `tf-plan` under the read-only role; `tf-apply` and add-ons behind `infra` approvals; destroy behind `infra-destroy` | Live | EXC-004, EXC-006 | SEC-037 verification |
| `tf-apply` applies the exact plan and Lambda zip that `tf-plan` built | Live | SEC-016 | SEC-016 entry |
| Destructive plan guard on buckets, KMS keys and tables; fails closed | Live | SEC-037 | Not yet seen blocking a real plan |
| `cd.yml`: build, scan, push by SHA, then bump tag and digest on `dev`; CI never touches the cluster | Live | SEC-011, SEC-031 | [gitops-deploy.md](../runbooks/gitops-deploy.md) |
| Environments: one reviewer (the maintainer), self-review allowed, admin bypass | Manual | EXC-003 | [bootstrap.md](../bootstrap.md) |

## 4. Dependencies and artifacts

| Control | Status | ID | Evidence and source |
|---|---|---|---|
| Tool versions pinned (Trivy, Checkov, Terraform, gitleaks, Kubescape, tflint, ZAP); Python packages `==` | Live | SEC-000, SEC-012 | Workflows; `app/requirements*.txt` |
| Providers constrained, lock files committed | Live | none | `.terraform.lock.hcl` in both roots |
| Base image pinned by digest; runs as user 10001 | Live | SEC-030 | `app/Dockerfile` |
| The scanned image is the one pushed | Live | SEC-012, SEC-031 | `cd.yml` jobs `build` and `push` |
| ECR: immutable tags, scan on push, KMS, lifecycle | Live | none | `terraform/modules/ecr` |
| Deploys pin the digest, not the tag | Live | SEC-031 | `cd.yml` `bump-image`; chart `deployment.yaml` |

## 5. Cluster and application

| Control | Status | ID | Evidence and source |
|---|---|---|---|
| Argo CD: dev auto-sync with prune and self-heal; prod sync by hand; `AppProject` limits repo, namespaces and kinds, no cluster-scoped objects | Live | none | `terraform/cluster-addons/charts/argocd-apps/` |
| Argo CD UI: GitHub sign-in only, RBAC by username, default `role:none`, admin login off | Live | none | `terraform/cluster-addons` (`argocd_rbac`, `helm_release.argocd`) |
| Argo CD reads Git as a GitHub App; key synced by External Secrets from one secret | Live | none | `charts/argocd-repo-secret/`; [argocd.md](../runbooks/argocd.md) |
| Pod hardening: non-root, read-only root FS, no escalation, no capabilities, seccomp, no token | Live | SEC-030 | Chart `deployment.yaml` |
| Pod Security `restricted` enforced on both app namespaces | Live | SEC-030, SEC-032 | `terraform/cluster-addons/main.tf` |
| Pod Security rejection test saved as evidence | Planned | none | `evidence/security/podsecurity/` does not exist |
| Per-namespace pod security groups via `SecurityGroupPolicy` | Live | SEC-021, SEC-032 | EXC-007 closure evidence |
| Kubernetes NetworkPolicy | Not enforced | SEC-021 | In the chart for intent; Fargate has no policy agent |
| Pod disruption budget, min 1 | Live | none | Chart `poddisruptionbudget.yaml` |
| Horizontal autoscaling | Planned | none | Off in `values.yaml`; metrics-server is installed |
| HTTPS only: ALB per environment, 80 redirects to 443, ACM | Live | SEC-033 | SEC-033 entry |
| EKS API public and private, access entries only | Live | SEC-018, EXC-005 | `terraform/modules/eks` |
| Read-only API, `x-api-key` compared in constant time, 403 without it | Live | SEC-022 | `app/tests/test_main.py` |
| CSP (no inline scripts, `form-action 'self'`), nosniff, no-store, HSTS, Permissions-Policy, COOP, CORP | Live | none | `app/tests/test_page_security.py` |
| Cross-Origin-Embedder-Policy | Planned | none | [security-scans.md](../runbooks/security-scans.md) |
| Logs hold request metadata only, never patient fields | Live | none | `app/src/main.py`; no test asserts it |
| Synthetic data only; table tagged `DataClassification = synthetic` | Live | SEC-026, EXC-008 | `terraform/modules/dynamodb` |

## 6. Infrastructure

| Control | Status | ID | Evidence and source |
|---|---|---|---|
| One KMS key with rotation for table, secret, ECR, logs and trail | Live | SEC-005, EXC-001 | Checkov full scan; Prowler 2026-10-10 |
| DynamoDB: KMS, point-in-time recovery; the app only reads | Live | SEC-022, SEC-023 | `terraform/modules/dynamodb` |
| Seeded values hidden in plan output (`sensitive()`) | Live | SEC-025 | SEC-025 entry |
| API key in Secrets Manager, set by hand, rotated every 30 days by a VPC Lambda with a DLQ | Live | SEC-003, SEC-027, EXC-002, EXC-009 | `terraform/modules/secrets`, `secret-rotation` |
| Pods read only the table, the secret and the key, through IRSA | Live | none | `terraform/main.tf` |
| VPC: pinned AZs, private pod subnets, one NAT, no public IP on launch | Live | SEC-001, EXC-015 | `terraform/modules/network` |
| VPC flow logs, KMS, 365 days | Live | SEC-002 | `terraform/modules/network` |
| EKS: Fargate only, secrets encryption, all control-plane logs, no creator admin | Live | SEC-018, SEC-019 | `terraform/modules/eks`; secrets encryption not checked on the live cluster |
| Apply role is cluster admin | Live | EXC-006 | `terraform/main.tf` |
| Operator: cluster-wide view only | Live | SEC-029 | [eks-operator-import.md](../runbooks/eks-operator-import.md); the user has a long-lived key and no MFA (Prowler N2) |
| Terraform state AES256, not KMS | Manual | EXC-008 | Bucket made by hand |
| No `Action: *` in CI policies; wildcards listed with owner | Live | EXC-001, EXC-009 | [bootstrap-policies](../bootstrap-policies/README.md) |

## 7. Detection

| Control | Status | ID | Evidence and source |
|---|---|---|---|
| CloudTrail, single region, validation, KMS, to S3, CloudWatch Logs and SNS | Live | SEC-035, SEC-036, EXC-010 | Delivery confirmed 2026-10-10 (SEC-037) |
| Trail and access-log buckets: private, versioned, TLS only, `force_destroy` | Live | SEC-036, EXC-012 to EXC-014 | `terraform/modules/detective` |
| GuardDuty with S3 data events and EKS audit logs | Live | SEC-035, EXC-011 | SEC-037 findings |
| Security Hub with FSBP | Live | SEC-035 | Needs AWS Config for control findings |
| ZAP baseline of dev, scheduled weekly | Live | none | Run by hand 2026-10-17; result in [security-scans.md](../runbooks/security-scans.md). No scheduled run yet |
| ZAP API and full scans of dev, scheduled weekly | Not run yet | none | Scheduled in `dast.yml`; never run (checked 2026-10-18) |
| Prowler, one manual run 2026-10-10 | Manual | none | [prowler-triage.md](prowler-triage.md) |
| Alert delivery (SNS subscriber), alarms, dashboards | Planned | none | Not in Terraform |
| AWS Config, Inspector, WAF | Planned | none | Not in Terraform |
| Incident simulation | Planned | none | Not run |

## 8. Budget

| Control | Status | ID | Evidence and source |
|---|---|---|---|
| $75 monthly budget, 4 alerts, filtered to `Project=cloudbatch818` | Live | SEC-038, SEC-041 | [budget.md](../cost/budget.md); the always-on run rate is above it (estimated) |
| Alert recipient receives alerts | Not verified | SEC-038 | No alert recorded |
| Destroy the stack between uses | Not done | EXC-013 | `terraform-destroy.yml` has never run (checked 2026-10-18) |

## Open items

1. **Apply role is cluster admin (EXC-006).** Anyone who gets an `infra` job approved acts as cluster admin. Planned fix, not scheduled: namespace-scoped policies plus a narrow role for the add-ons root.
2. **Argo CD server NetworkPolicy allows ingress from anywhere.** The chart default. Known gap.
3. **Unused deploy roles.** deploy-dev and deploy-prod are unused since 2026-10-15; EKS access removed 2026-10-18 (#151, applied). The IAM roles remain until deleted by hand.
4. **The stack has never been destroyed.** EXC-005, EXC-012 and EXC-013 cite the session destroy as a compensating control, but `terraform-destroy.yml` has no runs. The owner should review those three rows.
5. **Operator user:** a long-lived access key and no MFA (Prowler N2).
6. **Not verified:** role trust policies, the ecr-push policy, the state bucket settings, EKS secrets encryption on the live cluster, and whether patient fields are ever logged.
