# Presentation facts

One fact per line, with its source. **GAP** marks anything not confirmed. No account IDs, ARNs, emails or hostnames. Status at 2026-10-18.

## App and platform

- A read-only FastAPI API serves synthetic patient records from DynamoDB; write routes were removed (SEC-022, SEC-023).
- The stack runs in us-east-2 on EKS with Fargate only; no worker nodes (SEC-018).
- Pods run under Pod Security `restricted` in the app namespaces (SEC-030).
- One KMS key encrypts the table, the API key secret, ECR, CloudWatch Logs and the CloudTrail bucket (SEC-005, EXC-001).
- The API key is in Secrets Manager; a VPC Lambda rotates it every 30 days (SEC-003, SEC-027, EXC-009). Pods are restarted by hand after a rotation (SEC-034).
- Images are pushed to ECR with immutable tags and scan on push; deploys pin the digest that passed the Trivy scan (SEC-031).
- Detective controls: single-region CloudTrail with log file validation, GuardDuty with S3 data events and EKS audit logs, Security Hub with the FSBP standard (SEC-035, SEC-036).
- Terraform state is AES256-encrypted, not KMS (EXC-008).

## Networking

- Dev and prod share one VPC and one cluster, separated by namespace (SEC-021).
- Each environment has its own internet-facing ALB with HTTPS and an ACM certificate (SEC-033).
- Pods run in private subnets; outbound traffic uses one NAT gateway, a cost choice (EXC-015).
- Each app namespace has its own pod security group, verified on dev and prod pods on 2026-10-09 (SEC-032, EXC-007 closed).
- NetworkPolicy is not enforced on Fargate, so pod security groups are the isolation control (SEC-021).
- VPC flow logs go to KMS-encrypted CloudWatch Logs, kept 365 days (SEC-002).

## Delivery

- Since 2026-10-15, Argo CD deploys from Git (commit `2873e2c`); CI never runs Helm or kubectl. Dev syncs automatically; prod syncs only when an admin approves (`charts/argocd-apps/templates/applications.yaml:30-35`).
- `main` requires 10 status checks today, with 0 approvals: merges are gated by automated checks. The list is expected to grow (`docs/bootstrap.md`, EXC-003).
- There is no independent reviewer. The single maintainer is the only required reviewer, self-review is allowed and admins can bypass (EXC-003).
- Terraform runs only by manual dispatch with no inputs; `tf-apply` applies the plan that `tf-plan` produced (SEC-004, SEC-016).
- The destructive plan guard fails `tf-plan` on a delete or replace of an S3 bucket, KMS key or DynamoDB table, and fails closed (SEC-037).
- Teardown is one manual workflow (`terraform-destroy.yml`) and rebuild is one (`terraform-apply.yml`). The destroy has never been run (checked 2026-10-18).
- Manual steps around a rebuild: the GitHub App key secret and the Argo CD SSO secret, the API key value, and the dev and prod DNS alias records (`docs/bootstrap.md`, Manual steps around a rebuild).

## Access

- CI uses GitHub OIDC; no long-lived AWS keys are stored in GitHub (SEC-011).
- The plan role is read-only with no cluster access (SEC-019, SEC-037).
- The apply role has project-scoped write and is EKS cluster admin, behind a self-review gate on `infra` and `infra-destroy` (EXC-006).
- Argo CD sign-in is GitHub SSO only: admin login off, default role none, three named users: one admin, two read-only (`terraform/cluster-addons/main.tf:170,188`, `variables.tf:98-106`).
- The operator's break-glass read of `argocd` (Secrets included) was removed (#146). The operator keeps cluster-wide view only (SEC-029).
- The deploy roles are unused since 2026-10-15; their EKS access was removed 2026-10-18 (#151, applied). The IAM roles remain until deleted by hand.
- **GAP:** the operator IAM user has a long-lived access key and no MFA (SEC-029, Prowler N2).
- The EKS API endpoint is public and private; access entries only, no creator admin (EXC-005, SEC-018).

## Scanners

- **Checkov:** first Terraform scan 6 failed (2026-10-08). Latest CI run 39098252945 (2026-10-18): Terraform 388 passed, 0 failed, 15 skipped; workflows 627 passed, 0 failed, 1 skipped; Dockerfile 48 passed (SEC-001, SEC-002).
- All 15 inline `checkov:skip` comments map to a register entry with owner and expiry.
- **Trivy:** the gate was fixed to honor its config, which cleared 44 unfixable HIGH findings without an ignore file. Fixable HIGH and CRITICAL still block (SEC-012).
- **CodeQL:** 0 findings (SEC-007).
- **SonarCloud:** the first gate failed on coverage and reliability; both were fixed (SEC-013, SEC-014).
- **gitleaks:** 118 commits scanned, no leaks (run 39098252945). It uses the CLI because the action skipped release-merge commits (`.github/workflows/ci.yml:262`).
- **Kubescape** (report only): NSA 1 failed control for the app, 5 for Argo CD; CIS v1.12 1 and 12 (`docs/runbooks/security-scans.md:42-51`).
- **tflint:** 0 issues. **pip-audit:** no known vulnerabilities (both report only).
- **securitycontext-check** blocks `runAsGroup` without `runAsUser`, the setting that hung an Argo CD apply on Fargate (`scripts/check_run_as_user.py`).
- **Tests:** app pytest 126 passed, Lambda 13 passed (run 39098252945).
- **OWASP ZAP** (report only, weekly on dev): baseline High 0 to 0, Medium 1 to 0, Low 5 to 1 and Informational 4 to 4 after the header fixes (`docs/runbooks/security-scans.md:29-40`).

## Bucket incident (SEC-037, 2026-10-10)

- **Detected:** the apply failed; GuardDuty raised three Low findings (public access block off on both log buckets, access logging off on the trail bucket). Effective permission NOT_PUBLIC for all three.
- **Diagnosed:** the plan role could not call `HeadBucket` on the log buckets, so Terraform treated them as deleted and planned to recreate them. The apply removed 15 bucket sub-resources.
- **Repaired:** plan-role read access, bucket imports, then an apply that restored the configuration. Trail delivery confirmed at 22:01 on 2026-10-10.
- **Guarded:** the destructive plan guard now blocks that kind of plan.
- No alert fired: the SNS topic has no subscriber. The incident was diagnosed from the failed apply's logs.

## Prowler (scan dated 2026-10-10)

- 2,019 FAIL results across the shared account; 43 on this project: 0 critical, 15 high, 17 medium, 11 low (`docs/security/prowler-triage.md`).
- Every critical finding is on another team's resource or an account-level setting.
- Dispositions of the 58 critical and high checks: 3 covered by the register, 3 expected and deferred, 10 new, 32 out of scope (other workload), 10 out of scope (account owner) (`prowler-triage.md:160`).
- The 15 high results on this project: 3 covered by existing register entries, 2 expected and deferred to planned work, 10 new (N1 to N8) (`prowler-triage.md:100-159`).
- Eight new items, N1 to N8, are proposed and not yet in the register. They include operator MFA (N2) and EKS deletion protection (N5).
- The scan covered us-east-2 and global checks only, as the read-only operator.

## Cost (2026-10-18)

- Tagged spend month to date: $46.12, measured, owner-provided from Cost Explorer, before credits and taxes. By service: EKS $21.98, EC2-Other $10.43, CloudWatch $6.95, load balancing $6.10, KMS $0.48, Secrets Manager $0.13, S3 $0.03 (`docs/cost/budget.md`).
- The last full days ran $5.30 to $5.80 a day (measured).
- Fargate is not in the tagged figure: about $5.60 a day for 18 pods at list price (estimated).
- Always on: about $11 a day, about $335 a month (estimated).
- Levers, none done: destroy between uses; one ALB for dev and prod; no ApplicationSet controller; dev API and LB controller at one replica; a smaller API memory request.
- Budget: $75 a month, alerts at 50, 80 and 100 percent plus forecast, filtered on `Project=cloudbatch818` (SEC-038). The run rate is above it.
- **GAP:** budget alert delivery is unverified.
- The budget's tag value and `PROJECT_NAME` are set separately; changing one alone breaks the filter.

## Risk register

- 16 accepted risks, EXC-001 to EXC-016; EXC-007 is closed. All owned by the single maintainer, expiring in April 2027.
- EXC-005, EXC-012 and EXC-013 cite the session destroy, which has not run. Owner review pending.

## Built, next, planned

- **Built:** VPC with flow logs, EKS on Fargate, ECR, DynamoDB, Secrets Manager with rotation, KMS, CloudTrail, GuardDuty, Security Hub, OIDC CI/CD with scan gates, GitOps with Argo CD, the destructive plan guard, a tagged budget (SEC-001 to SEC-041).
- **Next:** Prowler items N1 to N8, alert delivery, a destroy and rebuild drill, a DNS alias check (SEC-033), the `sns_topic_name` drift fix (SEC-037).
- **Planned:** AWS Config, WAF, Inspector, alarms and an incident simulation.

## Honest answers

- Synthetic data only. No HIPAA or other compliance claim (SEC-026, EXC-008).
- SEC-033: the prod DNS alias first pointed at the dev load balancer. An HTTPS check caught it and it was repointed. Nothing checks it automatically yet.
- No public exposure in SEC-037: all three GuardDuty findings were NOT_PUBLIC.
- The EKS API endpoint is reachable from the internet by design, behind access entries (EXC-005).
