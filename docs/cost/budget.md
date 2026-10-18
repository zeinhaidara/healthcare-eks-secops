# Cost and budget

Status at 2026-10-18. Every number is labelled **measured** (read from Cost Explorer by the owner), **estimated** (worked out here from sizes and list prices), or **unverified** (not confirmed).

## Summary

- Running all day, the stack costs about $11 a day, or about $335 a month (estimated).
- Destroyed, it costs about $0.03 a day for the KMS key (estimated).
- The $75 monthly budget is below the always-on run rate. Only destroying between uses keeps spend under it.
- Budget alert delivery is unverified.

## What runs: 18 pods on Fargate

Each pod is its own Fargate task, billed by the size Fargate picks (estimated from the requests and the owner's console check).

| Component | Pods | Size each |
|---|---|---|
| Argo CD application controller | 1 | 0.25 vCPU / 1 GB |
| Argo CD server, repo-server, ApplicationSet, redis, dex | 5 | 0.25 vCPU / 0.5 GB |
| healthcare-api (2 dev, 2 prod) | 4 | 0.25 vCPU / 1 GB |
| External Secrets (controller, webhook, cert controller) | 3 | 0.25 vCPU / 0.5 GB |
| AWS Load Balancer Controller | 2 | 0.25 vCPU / 0.5 GB |
| CoreDNS | 2 | 0.25 vCPU / 0.5 GB |
| metrics-server | 1 | 0.25 vCPU / 0.5 GB |
| **Total** | **18** | 13 at 0.5 GB, 5 at 1 GB |

The api pods request 512Mi (`helm/healthcare-api/values.yaml:50-56`) but bill at 1 GB. Fargate adds memory for its own agents and rounds up (unverified).

Other billable resources in Terraform: 1 EKS control plane, 3 ALBs (dev, prod, Argo CD UI), 1 NAT gateway, 0 VPC endpoints, 1 KMS key, 1 Terraform-managed secret plus 2 created by hand, DynamoDB on demand, 4 log groups at 365 days, 2 S3 log buckets, CloudTrail, GuardDuty, Security Hub, 1 Lambda, 1 SQS queue, 1 SNS topic, ECR. No Route 53 zone is created.

## Tagged spend, month to date (measured)

From Cost Explorer, filtered on `Project=cloudbatch818`, at 2026-10-18, before credits and taxes. Owner-provided.

| Service | Month to date |
|---|---|
| EKS (control plane only, $2.40 a day) | $21.98 |
| EC2-Other (NAT gateway and data) | $10.43 |
| CloudWatch | $6.95 |
| Load balancing | $6.10 |
| KMS | $0.48 |
| Secrets Manager | $0.13 |
| S3 | $0.03 |
| All others | $0.00 |
| **Total** | **$46.12** |

The last full days ran $5.30 to $5.80 a day. The latest days may not have posted yet.

## Fargate compute (estimated)

Fargate is not in the tagged figure. Fargate usage likely cannot be tagged per cluster (unverified). Account-wide Fargate month to date is $42.14 across all clusters in the shared account (measured), so this project's share is below that.

From the pod sizes at list price:

| Pods | Size | Per pod per day | Per day |
|---|---|---|---|
| 13 | 0.25 vCPU / 0.5 GB | $0.296 | $3.85 |
| 5 | 0.25 vCPU / 1 GB | $0.350 | $1.75 |
| **18** | | | **about $5.60** |

Rates used: $0.000011244 per vCPU-second and $0.000001235 per GB-second (Linux/x86). Source: the AWS Fargate pricing page (aws.amazon.com/fargate/pricing), read 2026-10-18. The page shows these as US East (N. Virginia) rates. That us-east-2 matches is unverified.

## Run rate (estimated)

| State | Per day | Per month |
|---|---|---|
| Always on: tagged spend (about $5.50) plus Fargate (about $5.60) | about $11 | about $335 |
| Destroyed between uses | about $0.03 (KMS key) | about $1 |

When destroyed, the two secrets created by hand and the state bucket also remain. Their cost is small and unverified.

## Levers (estimated, none done yet)

| Lever | Saving while running | Notes |
|---|---|---|
| Destroy between uses | about $11 a day | The main lever. 40 hours a month up costs about $19 |
| One IngressGroup for the dev and prod ALBs | about $0.54 a day per ALB removed | Assumes an ALB rate of $0.0225 an hour before LCUs (unverified). Keep the Argo CD ALB separate |
| Disable the ApplicationSet controller | about $0.30 a day | Unused: Applications are defined directly |
| dev API at 1 replica | about $0.35 a day | Dev loses its PodDisruptionBudget cover |
| LB controller at 1 replica | about $0.30 a day | No standby controller |
| healthcare-api memory request lowered so it bills at 0.5 GB | about $0.21 a day | 4 pods. Needs a load test first |

Together the five running levers save about $1.70 a day, or about $52 a month. That still leaves an always-on stack above $75 a month.

## Budget

- `terraform/modules/budget`: $75 a month, alerts at 50%, 80% and 100% of actual spend, and at 100% of forecast.
- It counts only spend tagged `Project=cloudbatch818` (`modules/budget/variables.tf:25-34`). The tag comes from `default_tags` (`terraform/providers.tf:19-23`) and the `PROJECT_NAME` variable.
- **The run rate exceeds the limit.** Tagged spend alone runs about $5.50 a day when up, which crosses $75 in about two weeks. Month to date ($46.12) is already past the 50% alert.
- **Alert delivery is unverified.** No alert email has been recorded.
- The budget cannot see Fargate compute, so it understates the real cost.

## Cost allocation tag

The filter works only while `Project` is an active cost allocation tag in Billing. It is active; the management account activated it (SEC-038).

## Rules

- Destroy after every working session (`terraform-destroy.yml`, `infra-destroy` approval).
- Recheck this page after a lever lands or a service is added.
