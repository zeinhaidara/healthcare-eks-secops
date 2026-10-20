# Runbook: teardown

`terraform-destroy.yml` removes the cluster add-ons first, then the root stack. It does not handle load balancers the Load Balancer Controller created from Ingresses.

## Unblock a stuck teardown

Use `teardown-unblock.yml` when the add-ons step of `terraform-destroy.yml` fails with a timeout, and `cloudbatch818-healthcare-dev`, `cloudbatch818-healthcare-prod` or `argocd` stay in Terminating or have an Ingress that will not delete.

Cause: the controller was removed before its Ingresses, so nothing clears their finalizers.

Order:

1. Run `teardown-unblock.yml` and approve `infra-destroy`.
2. Run `terraform-destroy.yml` again. It removes the `argocd` release and namespace, External Secrets and the root stack.

What `teardown-unblock.yml` does:

- Checks the role can describe and delete EC2 security groups (dry run). ELB deletes have no dry run.
- Clears the controller finalizers on the two `healthcare-api` Ingresses, the `argocd-server` Ingress and their TargetGroupBindings.
- Clears the namespace finalizer only if a namespace is still Terminating after two minutes.
- Waits up to 10 minutes for the dev and prod namespaces to go.
- Deletes the project's three ALBs, three target groups and three managed load balancer security groups, then the backend security group if no network interface uses it.

It never touches NAT gateways, VPCs or subnets. IAM does not limit EC2 or ELB actions to project tags, so the tag match in step 5 (`elbv2.k8s.aws/cluster`) is the only safeguard. If the match differs from the expected list, the job fails and prints it. Re-check the list before changing it.

## Unlock a stuck Terraform state

A cancelled Terraform run leaves its lock behind. The next run fails with `Error acquiring the state lock` and a lock ID. Cancel a run only when you accept the unlock that follows.

Use `terraform-force-unlock.yml` with that lock ID and the state (`cluster-addons` or `root`), and approve `infra-destroy`.

- It fails if a `terraform-apply`, `terraform-destroy` or `teardown-unblock` run is queued or in progress.
- It reads the lock object (`<state key>.tflock`) and fails if its ID differs from the input.
- It then force-unlocks and lists the state without changing it.

`terraform-destroy.yml` also prints a read-only plan of the add-ons destroy before it destroys them. The plan runs under the same approval and does not pause the run.

## Manual cleanup after the destroy

Terraform does not own these. Remove them by hand, in this order:

1. GitHub App key secret (Secrets Manager).
2. Argo CD SSO secret (Secrets Manager).
3. API key secret (Secrets Manager).
4. The `dev` and `prod` Route 53 aliases.
5. The `deploy-dev` and `deploy-prod` IAM roles.
6. The `AWS_ROLE_ARN` variables on the `dev` and `prod` GitHub environments.
7. The Terraform state bucket, last.
