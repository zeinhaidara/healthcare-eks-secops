# Security controls: from PR gate to approval gate

Controls are HIPAA-aligned, not HIPAA compliant. Status: **Live** (in the repo), **Manual** (set up by hand, see `bootstrap.md`), **Planned** (phase noted).
Evidence for each fix is in `evidence/security/` and `improvement-log.md`.

## 1. Code and branch flow

| Control | Status | Where | What it does |
|---|---|---|---|
| Trunk with `dev` integration | Live | `DESIGN_PLAN.md` s12 | `feature/*` to `dev` to `main`. `dev` never deploys and has no AWS role access. |
| `main` ruleset | Manual | GitHub settings | PR required, required status checks, no force push, no deletions. "Require deployments to succeed" stays off. |
| CODEOWNERS | Live | `.github/CODEOWNERS` | Review ownership for `app/`, `terraform/`, `helm/`, `.github/`. |
| Dependabot | Live | `.github/dependabot.yml` | Weekly updates for pip, Docker and GitHub Actions. |
| No secrets in git | Live | `.gitignore`, Trivy secret scan | Local instructions, env files and keys are ignored; Trivy scans for committed secrets. |

## 2. PR gate (no AWS access, no OIDC)

Two independent pipelines. Neither depends on the other, and neither can reach AWS. Triggers: PR to `main` or `dev`, push to `dev`, no `paths:` filter so required checks always report.

| Check (job name) | Workflow | Gate |
|---|---|---|
| `app-test-lint` | `app-ci.yml` | pytest, ruff check, ruff format |
| `app-trivy` | `app-ci.yml` | Trivy dependencies and secrets, fail on HIGH or CRITICAL |
| `app-checkov` | `app-ci.yml` | Checkov on the Dockerfile and GitHub workflows |
| `tf-validate` | `terraform-ci.yml` | `fmt -check`, `init -backend=false`, `validate` |
| `tf-checkov` | `terraform-ci.yml` | Checkov on `terraform/` |

Supporting rules:
- Default token is `contents: read`. Actions pinned by commit SHA. Trivy, Checkov, Terraform, ruff and Python packages pinned. Base image pinned by digest.
- JSON and SARIF reports are uploaded as artifacts, 90-day retention.
- Exceptions only through a documented suppression (`exceptions-register.md`) with owner and expiry.
- Checkov severity filtering needs a platform key, so any failed check fails the build (stricter than HIGH or CRITICAL).

## 3. Release and approval gate

| Control | Status | What it does |
|---|---|---|
| `app-release.yml` on push to `main` (path filtered) | Planned, Phase 4 | Builds the image tagged with the commit SHA. |
| Image scan before push | Planned, Phase 4 | Trivy image scan, fail on HIGH or CRITICAL, before anything reaches ECR. |
| ECR hardening | Live (Terraform, not yet applied) | Immutable tags, scan on push, KMS encryption, lifecycle policy. |
| Deploy with `--atomic --wait` | Planned, Phase 4 | Failed deploys roll back automatically. Same SHA goes to dev, then prod. |
| GitHub Environments `infra`, `dev`, `prod` | Manual | Each requires approval and deploys from `main` only. |
| Terraform plan, apply, destroy | Live | `terraform-apply.yml`, `workflow_dispatch` only. The `tf-plan` job and the separate `tf-apply` job each need `infra` approval, so the plan is read before apply. Apply runs the saved plan file. Destroy needs typed `DESTROY`. Only one run at a time (concurrency group). |
| Rollback | Planned, Phase 4 | `helm rollback`, `scripts/rollback.sh`, `docs/runbooks/rollback.md`. |

## 4. Identity and least privilege

No long-lived AWS keys anywhere. GitHub OIDC only, one role per purpose, created by hand. Role ARNs reach the workflows through variables only.

| Role | Used by | Intended access | Policy detail |
|---|---|---|---|
| plan | Not used yet (see open item below) | read-only | To fill from console |
| apply | `terraform-apply.yml`, environment `infra` | write, scoped to project resources and the `cloudbatch818-zein-hcsecops-logs-*` bucket pattern | To fill from console |
| ecr-push | `app-release.yml` push job (no environment) | push to the project ECR repo only | To fill from console |
| deploy-dev | `app-release.yml` dev deploy | EKS access entry, `AmazonEKSEditPolicy`, dev namespace only | To fill from console |
| deploy-prod | `app-release.yml` prod deploy | EKS access entry, `AmazonEKSEditPolicy`, prod namespace only | To fill from console |

Runtime roles (Terraform, Phase 3):

| Role | Permissions | Trust |
|---|---|---|
| App pod (one per namespace) | `secretsmanager:GetSecretValue` on the single API key secret ARN; `kms:Decrypt` on the project key; DynamoDB item access on the single patients table ARN | OIDC provider of the cluster, that namespace and service account only |
| AWS Load Balancer Controller | The controller's minimum policy | Its own service account in `kube-system` |

Rules: no `"Action": "*"` or `"Resource": "*"` unless justified in a code comment and approved. The apply role is cluster creator and therefore cluster admin; this is an accepted risk to be recorded in `exceptions-register.md` when EKS lands.

Open item: the plan role trusts `sub` = `:pull_request`, which a `workflow_dispatch` run does not present, so `terraform-apply.yml` currently plans under the apply role (behind the `infra` approval). Decide whether to keep that or re-trust the plan role. Review results go in `rbac-review.md`.

## 5. Data protection

| Control | Status |
|---|---|
| Customer-managed KMS key with rotation (ECR, CloudWatch logs, Secrets Manager, DynamoDB now; EKS secrets in Phase 3) | Live (Terraform, not yet applied) |
| API key in Secrets Manager (plaintext string, value set by hand, never in Terraform state), fetched by the app through IRSA, never in a Kubernetes Secret | Live in app, infra Phase 2 and 3 |
| HTTPS only on the ALB with an ACM certificate | Planned, Phase 3 and 4 |
| Synthetic data only; patient fields never logged | Live |
| Frontend CSP (`default-src 'none'`, no inline scripts), `nosniff`, `no-store` | Live |
| `x-api-key` compared in constant time | Live |

## 6. Runtime hardening

| Control | Status |
|---|---|
| Non-root user (UID 10001), read-only root filesystem, writable `/tmp` only | Live in Dockerfile |
| Pod `securityContext`: no privilege escalation, drop ALL capabilities, `seccompProfile: RuntimeDefault`, no service account token | Planned, Phase 4 |
| Pod Security `restricted` on both namespaces, rejection test saved as evidence | Planned, Phase 3 and 4 |
| Default-deny NetworkPolicy plus ingress allow rule | Planned, Phase 4 |
| Resource requests and limits, PDB, HPA | Planned, Phase 4 |

## 7. Detection and audit

| Control | Phase |
|---|---|
| VPC flow logs to KMS-encrypted CloudWatch, 30-day retention (Phase 2, written); EKS control-plane logs (Phase 3) | 2 and 3 |
| CloudTrail (multi-region, log validation, KMS), GuardDuty (including EKS audit logs), Inspector (ECR), Config, Security Hub | 5 |
| WAF: AWS managed common rules plus a rate limit | 5 |
| Alarms with severity and owner, metric-filter alarm | 6 |
| Prowler `hipaa_aws` before and after hardening, findings triage | 7 |
| Incident simulation and runbooks | 8 |
