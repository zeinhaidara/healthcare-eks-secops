# Budget

**Monthly budget: $75** (us-east-2). Alerts at 50%, 80% and 100% of actual spend, plus a 100% forecast alert, sent to `ALERT_EMAIL`. The AWS Budget itself is created in Terraform in Phase 2.

## Estimates

Rough on-demand estimates, not checked against current pricing. Replace with measured values in the Phase 8 cost baseline.

| Item | Running 24/7 | Destroyed after each session (about 40 hours a month) |
|---|---|---|
| EKS control plane | about $73 | about $4 |
| NAT gateway | about $33 plus data | about $2 |
| ALB | about $16 | about $1 |
| Fargate (4 pods, 0.5 vCPU and 1 GB each) | about $70 | about $4 |
| Always-on (KMS, Secrets Manager, ECR, DynamoDB, logs) | about $5 to $10 | about $5 to $10 |
| Security services (Config, GuardDuty, Inspector, Security Hub) | about $15 to $40 | about $15 to $40 |
| **Total** | **about $230 to $300** | **about $35 to $60** |

## Rules
- Destroy after every working session (`terraform-apply.yml`, `action=destroy`).
- A forgotten cluster costs roughly $8 to $10 a day; the 80% alert is the signal to check.
- Re-check this table at the end of Phase 5 (security services) and update the budget if needed.
