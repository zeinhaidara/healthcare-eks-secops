# Budget

**Monthly budget: $75** (us-east-2). Alerts at 50%, 80% and 100% of actual spend, plus a 100% forecast alert, sent to `ALERT_EMAIL`. The AWS Budget itself is created in Terraform (Terraform foundation, Phase 2; see the [phase map](../phase-map.md)).

Scope: the budget counts only spend tagged `Project=cloudbatch818`, because the account is shared (SEC-038). Untagged spend is not counted. The tags match: CI sets `project_name` from the `PROJECT_NAME` repo variable (`cloudbatch818`), and the filter is `Project$cloudbatch818`. The controller-created ALB carries the same tag (PR #56, SEC-041; checked by the operator on 2026-10-12, not verified from the repo). Fargate pod compute attribution is not confirmed; check Cost Explorer. Tag activation and checks are in this page, under [Prerequisite: activate the cost allocation tag](#prerequisite-activate-the-cost-allocation-tag).

The monthly AWS Budget (`terraform/modules/budget`, $75, alerts at 50%, 80% and 100% of actual spend and a 100% forecast alert) counts only spend tagged `Project=cloudbatch818` (SEC-038). The account is shared with other teams, so an unfiltered budget would track their spend too. Estimates and rules are at the end of this page, under [Estimates](#estimates) and [Rules](#rules).

The filter is built from the module variables `cost_tag_key` (default `Project`) and `cost_tag_value` (default `cloudbatch818`), as the Budgets cost filter `TagKeyValue` = `user:Project$cloudbatch818`.

## Prerequisite: activate the cost allocation tag

The filter matches nothing until `Project` is an **active user-defined cost allocation tag** in Billing.

1. Billing and Cost Management console, Cost allocation tags, User-defined tags: find `Project` and activate it. The tag only appears in that list after it has been on a resource for a while (up to 24 hours).
2. The account is part of an AWS Organization. If it is a member account, only the management account can activate cost allocation tags; ask the account owner to do it.
3. Activation can take up to 24 hours to take effect. Spend from before activation is not attributed to the tag unless the account owner requests a backfill in the same console page.

## What to expect after apply

- A scoped actual spend of **$0** in the first hours or day after the apply is expected: the tag is not active yet, or its data has not arrived. It is not a sign that the filter is wrong.
- Check after a day: Cost Explorer, filter Tag `Project` = `cloudbatch818`, current month. The budget's actual spend should match that view.
- If it is still $0 after 48 hours with the stack running, check that the tag shows as active and that the value matches exactly (tag values are case-sensitive).

## Status (2026-10-11)

- The scope filter was applied on 2026-10-11 (operator-confirmed, SEC-038).
- The `Project` cost allocation tag is confirmed active in Billing. The management account activated it, because this account is an Organization member (SEC-038).
- The budget's scoped-spend history shows $0 before October 2026. That reflects the filter and the tag activation, not zero project cost before then. The spend shown before the scope change was the whole shared account.
- October 2026 tagged spend: $9.80 of $75 (SEC-038). This is a lower bound; see the next section.
- The alert recipient is still unverified (SEC-038); see [Alert recipient](#alert-recipient).

## What the filter does not count

Only spend on resources that carry the tag is counted. These may be missing from the scoped budget:

- Fargate pod compute (pods carry no AWS tags), unless EKS split cost allocation data is enabled in Billing; whether it is was not checked.
- Charges not tied to a tagged resource, such as some data transfer and account-level service charges.

Treat the scoped budget as a lower bound. For a full view during a session, look at the unfiltered Cost Explorer view for the services in the [Estimates](#estimates) table. The ALB tag landed in PR #56 (SEC-041).

## Alert recipient

Alerts go to the email in the `ALERT_EMAIL` GitHub variable (passed as `alert_email`). Delivery to that address has not been verified (open in SEC-038). To verify, confirm the address in the budget's alert settings in the Budgets console and record the first alert email that arrives.

## Estimates

Rough on-demand estimates, not checked against current pricing. Replace with measured values in the cost baseline (wrap-up, Phase 8).

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
- Destroy after every working session (`terraform-destroy.yml`, behind the `infra-destroy` approval).
- A forgotten cluster costs roughly $8 to $10 a day; the 80% alert is the signal to check.
- Re-check this table once the security services are in place (older text: Phase 5; see the [phase map](../phase-map.md)) and update the budget if needed.
