# Presentation facts

One fact per line, each with its source: a SEC or EXC ID, or a file or setting where no ID exists. **GAP** marks anything not confirmed in the repo or in a setting that was read. No account IDs, ARNs, emails or hostnames. Status as of 2026-10-11.

## Architecture

- A read-only FastAPI healthcare API serves synthetic patient records from DynamoDB; write routes were removed (SEC-022, SEC-023).
- The stack runs in us-east-2 on EKS with Fargate only; no EC2 worker nodes (SEC-018, `terraform/modules/eks`).
- Pods run under Pod Security `restricted` in the app namespaces (SEC-030).
- One KMS project key encrypts the table, the API key secret, ECR, CloudWatch Logs and the CloudTrail bucket (SEC-005, EXC-001).
- The API key lives in Secrets Manager and a VPC Lambda rotates it every 30 days (SEC-003, SEC-027, EXC-009).
- Deploys run through Argo CD from Git; CI never runs Helm or kubectl. Pods are restarted by hand after a key rotation (SEC-034).
- Images are pushed to ECR with immutable tags and scan on push; deploys pin the digest that passed the Trivy scan (SEC-031).
- Detective controls: a single-region CloudTrail with log file validation, GuardDuty with S3 data events and EKS audit logs, and Security Hub with the FSBP standard (SEC-035, SEC-036).
- Terraform state is AES256-encrypted, not KMS, and holds synthetic seed values only (EXC-008).

## Dev and prod networking

- Dev and prod share one VPC and one EKS cluster and are separated by namespace (`terraform/main.tf`, SEC-021).
- Each environment has its own internet-facing ALB with HTTPS and an ACM certificate, created by the AWS Load Balancer Controller (SEC-033, `helm/healthcare-api/templates/ingress.yaml`).
- Pods run in private subnets; outbound traffic goes through one NAT gateway (cost choice; `terraform/modules/network`, no SEC ID).
- Each app namespace has its own pod security group, attached by `SecurityGroupPolicy` and verified on dev and prod pods on 2026-10-09 (SEC-032, EXC-007 closed).
- Kubernetes NetworkPolicy is not enforced on Fargate, so pod security groups are the isolation control (SEC-021).
- VPC flow logs go to KMS-encrypted CloudWatch Logs with 365-day retention (SEC-002).

## Access model

- CI uses GitHub OIDC; no long-lived AWS keys are stored in GitHub (SEC-011, `docs/bootstrap.md`).
- The plan role is read-only and has no cluster access (SEC-019, SEC-037, `docs/bootstrap-policies/plan-policy.json`).
- The apply role has project-scoped write and is EKS cluster admin, behind a self-review gate on the `infra` and `infra-destroy` environments (EXC-006, SEC-019).
- The two deploy roles (namespace-scoped `AmazonEKSEditPolicy`) are unused since the move to Argo CD and still to be removed (SEC-019).
- The operator has `AmazonEKSViewPolicy` at cluster scope and read-only AWS access (SEC-029).
- The operator IAM user has a long-lived access key (SEC-029 residual risk) and no MFA (Prowler triage N2; no SEC ID yet).
- The EKS API endpoint is public (0.0.0.0/0) and private, because GitHub-hosted runners need it; authentication is by access entries only, with no creator admin (EXC-005, SEC-018).

## Environments

- `prod`, `infra` and `infra-destroy` deploy only from `main` (GitHub environment branch policy, read 2026-10-11).
- `dev` deploys only from protected branches, which are `dev` and `main` (GitHub environment branch policy and branch protection, read 2026-10-11).
- There is no independent reviewer. Each environment's only required reviewer is the single maintainer, self-review is allowed (`prevent_self_review=false`), and repo admins can bypass environment rules (`can_admins_bypass=true`). Recorded as EXC-003 (GitHub settings read 2026-10-11).
- Required approvals on `main` are 0 because there is a single maintainer; required status checks are the compensating control (EXC-003, SEC-009).
- Terraform runs only by manual dispatch with no inputs; `tf-apply` applies the exact plan that `tf-plan` produced (SEC-004, SEC-016).

## Security tools

- **Trivy** scans dependencies, secrets and the image for HIGH and CRITICAL fixable findings, so images with fixable HIGH or CRITICAL findings cannot be pushed. Unfixable findings are reported, not blocked (SEC-012). The gate was fixed to honor its config, which unblocked 44 unfixable HIGH findings without an ignore file (SEC-000, SEC-012).
- **Checkov** scans Terraform, the Dockerfile and workflows as a PR gate, which forced fixes such as pinned AZs and 365-day flow logs. First Terraform scan: 6 fails (`evidence/security/checkov/before/terraform/summary.txt`, 2026-10-08). Latest full scan: 0 fails, 15 skipped (`evidence/security/checkov/after/detective/full-final/results_json.json`) (SEC-001, SEC-002).
- All 14 inline `checkov:skip` comments map to a register entry with an owner and expiry (EXC-001, 002, 005, 007, 009 to 012, 014). No `.trivyignore` or Prowler mutelist exists. The full scan reports 15 skips because the pod security group skip covers two namespaces.
- **CodeQL** (security-extended) gives semantic analysis of Python and workflows that the other tools lack; 0 findings (SEC-007).
- **SonarCloud** enforces a quality gate on PRs; the first gate failed on coverage and reliability, both fixed (SEC-008, SEC-013, SEC-014, SEC-015).
- **CloudTrail, GuardDuty and Security Hub** provide audit logging and threat detection for the running stack (SEC-035, SEC-036).
- **Prowler** gave a posture scan of the live account, triaged against the register (`docs/security/prowler-triage.md`; no SEC ID).
- **Destructive plan guard**: `tf-plan` fails, before any plan artifact exists, on a delete or replace of an S3 bucket or bucket sub-resource, a KMS key or a DynamoDB table, and fails closed on a missing plan or a grep error (SEC-037).

## Bucket incident (SEC-037)

- The plan role could not call `HeadBucket` on the two detective log buckets; the provider treated the 403 as "deleted" and planned to recreate them (SEC-037).
- The apply removed 15 bucket sub-resources (public access blocks, policies, versioning and others) while the buckets remained, then failed with `BucketAlreadyOwnedByYou` (SEC-037).
- Repair: plan role read access, `import` blocks for the two buckets, and the destructive plan guard; the apply recreated the configuration and the import blocks were removed (SEC-037).
- Accepted drift, as the register states it: "Accepted as provider drift; it does not change delivery." Outcome: "closed (2026-10-10). The `sns_topic_name` drift is accepted and tracked as a follow-up." (SEC-037)
- Trail delivery was confirmed at 22:01 on 2026-10-10: log files, SNS notifications, CloudWatch Logs and digests (SEC-037).
- GuardDuty raised three Low severity findings in the incident window (2026-10-10, 15:19 to 15:25 America/New_York): public access block disabled on both log buckets, and server access logging disabled on the trail bucket. The actor was the apply role through GitHub Actions. The findings are kept as history. (Resolved GAP: SEC-037)
- The effective permission was NOT_PUBLIC for all three findings, per the GuardDuty findings, operator-verified 2026-10-11 (SEC-037). The public access blocks and trail-bucket logging are back in place (SEC-037).
- Alerting is planned, not built: the CloudTrail SNS topic has no subscriber (`docs/runbooks/detective-controls.md`, known gaps). The incident was diagnosed from the failed apply run's logs (SEC-037).

## Prowler (2026-10-10 scan)

- 2,019 FAIL results across the whole shared account (`docs/security/prowler-triage.md`).
- 43 FAIL results are on this project's resources: 0 critical, 15 high, 17 medium, 11 low (`docs/security/prowler-triage.md`).
- Every critical finding is on another team's resource or an account-level setting (`docs/security/prowler-triage.md`).
- Eight new items, N1 to N8, were proposed and not yet added to the register: confused-deputy conditions (N1), operator MFA (N2), image secret patterns, likely a false positive (N3), secret resource policy (N4), EKS deletion protection (N5), GuardDuty Runtime Monitoring and AI Protection (N6), four GuardDuty high-severity findings to review (N7), Security Hub delegated admin (N8) (`docs/security/prowler-triage.md`).
- The scan ran as the operator read-only identity and covered us-east-2 plus global checks only (`docs/security/prowler-triage.md`).

## Budget and cost

- The budget is `cloudbatch818-zein-hcsecops-monthly`: $75 a month, with four alerts (actual spend at 50, 80 and 100 percent, forecast at 100 percent), all set in Terraform (SEC-038, `terraform/modules/budget`).
- The budget is filtered to the `Project=cloudbatch818` cost tag (SEC-038).
- The filter was applied on 2026-10-11 (SEC-038, operator-confirmed).
- October 2026 tagged spend is $9.80 of $75. This is the 2026-10-11 reading and a possible lower bound: Fargate attribution is not confirmed (check Cost Explorer). The tags match (`PROJECT_NAME` = `cloudbatch818`) and the ALB carries the same tag (checked by the operator on 2026-10-12, not verified from the repo) (SEC-038, SEC-041).
- The scoped-spend history shows $0 before October 2026. That reflects the filter and tag activation, not zero project cost before then (SEC-038, `docs/cost/budget.md`).
- The `Project` cost allocation tag is active in Billing. The management account activated it, because this account is an Organization member (SEC-038, operator-confirmed).
- **GAP:** the alert subscriber is unverified, so no alert delivery has been confirmed. The operator identity lacks permission to view the notification settings (SEC-038).
- **GAP (explanation only):** the spend shown before the scope change was the whole shared account, not this project (SEC-038).

## Risk register

16 accepted risks, EXC-001 to EXC-016, all owned by Moulaye and expiring in April 2027. EXC-007 is closed. Full list: `docs/security/exceptions-register.md`.

## Built, planned, next

- **Built:** VPC with flow logs, EKS on Fargate, ECR, DynamoDB, Secrets Manager with rotation, KMS, CloudTrail, GuardDuty, Security Hub, OIDC CI/CD with scan gates, a destructive plan guard and a project-scoped budget (SEC-001 to SEC-041).
- **Next:** Prowler items N1 to N8 (`docs/security/prowler-triage.md`), a DNS alias check before a deploy is called verified (SEC-033), the `sns_topic_name` drift fix (SEC-037), and the ALB tag lookup evidence (SEC-041).
- **Planned:** AWS Config, WAF, Inspector, CloudWatch alarms with alert delivery, and a full incident simulation (`docs/security/controls.md` section 7, README).

## Honest answers

- Synthetic data only. Not PHI. HIPAA-aligned, not HIPAA-compliant (`docs/security/controls.md`; SEC-026; EXC-008).
- SEC-033: the prod DNS alias first pointed at the dev load balancer; it was caught by an HTTPS check and repointed. Nothing automated checks it yet (SEC-033).
- No public exposure: GuardDuty reported effective permission NOT_PUBLIC for all three incident findings (SEC-037).
- The EKS API endpoint is reachable from the internet by design, behind access-entry authentication (EXC-005).
