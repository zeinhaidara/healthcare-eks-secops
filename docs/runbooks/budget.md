# Runbook: project-scoped monthly budget

The monthly AWS Budget (`terraform/modules/budget`, $75, alerts at 50%, 80% and 100% of actual spend and a 100% forecast alert) counts only spend tagged `Project=cloudbatch818` (SEC-038). The account is shared with other teams, so an unfiltered budget would track their spend too. Estimates and rules: [docs/cost/budget.md](../cost/budget.md).

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

## What the filter does not count

Only spend on resources that carry the tag is counted. In this code these carry no `Project` tag, so their spend is likely missing from the scoped budget:

- ALBs created by the AWS Load Balancer Controller (no default tags configured on the controller or the Ingress).
- Fargate pod compute (pods carry no AWS tags), unless EKS split cost allocation data is enabled in Billing; whether it is was not checked.
- Charges not tied to a tagged resource, such as some data transfer and account-level service charges.

Treat the scoped budget as a lower bound. For a full view during a session, look at the unfiltered Cost Explorer view for the services in [docs/cost/budget.md](../cost/budget.md). Tagging the controller's ALBs is a follow-up (SEC-038).

## Alert recipient

Alerts go to the email in the `ALERT_EMAIL` GitHub variable (passed as `alert_email`). Delivery to that address has not been verified (open in SEC-038). To verify, confirm the address in the budget's alert settings in the Budgets console and record the first alert email that arrives.
