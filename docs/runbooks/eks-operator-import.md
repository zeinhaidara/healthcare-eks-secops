# Runbook: operator access entry

The operator's EKS access entry was created by hand, imported into Terraform once, and is now managed normally as `aws_eks_access_entry.operator` and `aws_eks_access_policy_association.operator_view` in `terraform/main.tf`.

| Item | Value |
|---|---|
| Principal | IAM user from `operator_iam_user_name` (override with `operator_principal_arn`) |
| Kubernetes username | `zein` |
| Access | `AmazonEKSViewPolicy` at cluster scope, plus `AmazonEKSAdminViewPolicy` on `argocd` only (below). No Edit or Admin, no groups. |

Change it only through Terraform. A console change shows up as a plan diff. Access beyond View needs a review.

## Break-glass read on `argocd`

`operator_argocd_read` gives read-only access (get, list, watch) to everything in `argocd`, Secrets included. It adds no write and nothing outside `argocd`. It was added to read the initial admin password. The admin login is now off, so it can go: delete the resource in a PR into `dev`, release, and run `terraform-apply` (one resource destroyed).

## Import again, if ever needed

Add `import {}` blocks next to the resources with these IDs:

- entry: `<cluster_name>:<principal_arn>`
- association: `<cluster_name>#<principal_arn>#arn:aws:eks::aws:cluster-access-policy/AmazonEKSViewPolicy`

The plan must say "will be imported". "Will be created" means the IDs did not match; stop. Remove the blocks after the apply, or a rebuild fails.

## Check

```sh
aws eks list-associated-access-policies --cluster-name "$CLUSTER_NAME" --principal-arn <principal_arn> \
  --query 'associatedAccessPolicies[].{policy:policyArn,scope:accessScope}'
```

Expect `AmazonEKSViewPolicy` at cluster scope, and `AmazonEKSAdminViewPolicy` on `argocd` until the break-glass is removed.
