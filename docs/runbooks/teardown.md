# Runbook: teardown

The stack was torn down on 2026-10-20. This page records how, and how to do it again after a rebuild.

`terraform-destroy.yml` removes the cluster add-ons first, then the root stack. It does not handle load balancers that the Load Balancer Controller created from Ingresses.

## Destroy in two stages

`terraform-destroy.yml` has two jobs, each behind its own `infra-destroy` approval.

1. `tf-plan` plans the destroy of the add-ons and of the root and prints the counts per action in the run summary. The plans are the artifacts `addons-destroy-plan` and `root-destroy-plan`. The add-ons plan is skipped when the cluster is gone.
2. `tf-destroy` runs only after the second approval.

Read the plan artifacts before you approve the destroy. The destroy runs a fresh `terraform destroy`, so it can differ from the plan if something changed in between.

## Unlock a stuck Terraform state

A cancelled Terraform run leaves its lock behind. The next run fails with `Error acquiring the state lock` and a lock ID. Cancel a run only when you accept the unlock that follows.

Use `terraform-force-unlock.yml` with that lock ID and the state (`cluster-addons` or `root`), and approve `infra-destroy`.

- It fails if a `terraform-apply` or `terraform-destroy` run is queued or in progress.
- It reads the lock object (`<state key>.tflock`) and fails if its ID differs from the input.
- It then force-unlocks and lists the state without changing it.

## Before the next destroy

The first destroy stalled because the Load Balancer Controller was removed before the Ingresses it manages. Nothing was left to clear their finalizers, so the app namespaces stayed in Terminating and the ALBs, target groups and security groups stayed in AWS.

A one-off workflow, `teardown-unblock`, cleared it and has since been removed: it hard-coded this deployment's ALB names and security group IDs. Before the next destroy, delete the app Ingresses and wait for their ALBs to go, while the controller is still running.

## Record of the 2026-10-20 teardown

| Run | Workflow | Result | What happened |
|---|---|---|---|
| 39319802953 (2026-10-19) | `terraform-destroy` | failed | Add-ons destroy timed out: the controller was gone, the Ingress finalizers stayed |
| 39424729683 | `terraform-destroy` | cancelled | Cancelled before it finished |
| 39424818401 | `teardown-unblock` | failed | Cleared the finalizers and deleted the three ALBs; the target group delete raced the ALB delete |
| 39426118816 | `teardown-unblock` | failed | The backend security group delete hit `DependencyViolation`: a rule in the cluster security group still referenced it |
| 39427441001 | `teardown-unblock` | succeeded | Revoked that rule and deleted the backend security group |
| 39427626900 | `terraform-destroy` | failed | `Error acquiring the state lock` |
| 39430313614 | `terraform-force-unlock` | succeeded | Released the stuck state lock |
| 39430484482 | `teardown-unblock` | failed | UNKNOWN: the log was not read |
| 39430619481 | `terraform-destroy` | succeeded | `Destroy complete! Resources: 129 destroyed.` The add-ons were already gone |

The destroy also removed the GuardDuty detector and the Security Hub subscription for us-east-2. Both were account-wide in a shared account, so they are now off for every workload in that region (SEC-042).

## Manual cleanup after the destroy

Terraform does not own these. They are removed by hand. Status checked on 2026-10-20.

1. GitHub App key secret `healthcare/argocd/github-app` (Secrets Manager): present, pending decision.
2. Argo CD SSO secret (Secrets Manager): pending deletion (requested 2026-10-20).
3. API key secret (Secrets Manager): done (checked 2026-10-20). The destroy deleted it.
4. The `dev` and `prod` Route 53 A records: done (verified gone 2026-10-20). The zone holds only its NS and SOA records.
5. Hosted zone `cloudbatch818.click` (`Z0900957ARJDK4SXKDV0`): kept by decision, 2026-10-20. The domain registration is still active, with auto-renew off, and expires on 2027-09-25. Deleting the zone while the domain is registered would leave the domain pointing at name servers that answer nothing. Other teams' domains in the same account are out of scope.
6. IAM roles `gha-deploy-dev`, `gha-deploy-prod`, `gha-ecr-push`, `gha-plan` and `gha-apply`: done (verified 2026-10-20, `NoSuchEntity`).
7. Terraform state bucket `cloudbatch818-zein-hcsecops-tfstate-866934333672`: done (verified gone 2026-10-20).
8. The `AWS_ROLE_ARN` variables on the `dev` and `prod` GitHub environments: done (checked 2026-10-20). Both environments still exist with `ENVIRONMENT` and `K8S_NAMESPACE` only.
9. Repo variables `AWS_ECR_PUSH_ROLE_ARN` and `AWS_PLAN_ROLE_ARN`: pending, to be removed by hand. They point at deleted roles. `ROUTE53_ZONE_ID` and `AWS_ACCOUNT_ID` stay, because the zone stays.
10. Operator user access key: present, Active. Pending, to be done last by the operator, outside this session. It is the identity used for this cleanup.
11. `cloudbatch818-zein-dev-*` resources and the role `cloudbatch818-zein-github-actions-terraform`: pending, manual, later.
