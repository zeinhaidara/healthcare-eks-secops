# Budget

**$75 a month**, set in Terraform (`terraform/modules/budget`). Alerts at 50%, 80% and 100% of actual spend and at 100% of forecast go to the `ALERT_EMAIL` variable.

## Scope

The account is shared, so the budget counts only spend tagged `Project=cloudbatch818` (SEC-038). The filter is `user:Project$cloudbatch818`, built from `cost_tag_key` and `cost_tag_value`. CI sets the tag from the `PROJECT_NAME` variable. The controller-created ALB carries it too (SEC-041).

Not counted, so treat the budget as a lower bound:

- Fargate pod compute, unless EKS split cost allocation is on in Billing (not checked).
- Charges not tied to a tagged resource, such as some data transfer.

For a full view during a session, use unfiltered Cost Explorer.

## Cost allocation tag

The filter matches nothing until `Project` is an active user-defined cost allocation tag. It is active now, activated by the management account because this account is an Organization member. On a new account:

1. Billing, Cost allocation tags, User-defined: activate `Project`. It appears up to 24 hours after first use.
2. Activation takes up to 24 hours. Older spend is not attributed unless a backfill is requested.

A scoped spend of $0 in the first day after apply is expected. If it is still $0 after 48 hours with the stack up, check the tag is active and the value matches exactly.

## Status

- October 2026 tagged spend: $9.80 of $75, read 2026-10-11 (SEC-038). History before October shows $0 because of the filter, not zero cost.
- Alert delivery is not verified. To verify, check the address in the Budgets console and record the first alert.

## Observed spend (whole account, Oct 9 to 12, 2026)

About $4.29 a day, or $129 a month if left running. Split for Oct 12:

| Service | Per day | Note |
|---|---|---|
| EKS | ~$2.40 | Control plane at $0.10 an hour |
| EC2-Other | ~$1.10 | One NAT gateway at $0.045 an hour |
| CloudWatch | ~$0.80 | Rising daily; cause not found |
| ELB | ~$0.25 | |
| Other | ~$0.05 | |

Fargate compute, GuardDuty and Security Hub are not visible as separate lines.

## Estimates

Rough, not checked against current pricing.

| Item | Running 24/7 | Destroyed after each session (~40 h a month) |
|---|---|---|
| EKS control plane | ~$73 | ~$4 |
| NAT gateway | ~$33 plus data | ~$2 |
| ALB | ~$16 | ~$1 |
| Fargate (4 pods, 0.5 vCPU, 1 GB) | ~$70 | ~$4 |
| KMS, Secrets Manager, ECR, DynamoDB, logs | ~$5 to $10 | ~$5 to $10 |
| GuardDuty, Security Hub | ~$2 to $10 ([detective-controls.md](../runbooks/detective-controls.md)) | less |
| **Total** | **~$200** | **~$16 to $21** |

## Rules

- Destroy after every working session (`terraform-destroy.yml`, `infra-destroy` approval).
- A forgotten stack costs about $4 to $10 a day. The 80% alert is the signal to check.
- Recheck the estimates if Config, Inspector or WAF are built.
