# Runbook: operator access entry (imported with import blocks)

The operator entry was created by hand in the EKS console. Terraform manages it as `aws_eks_access_entry.operator` and `aws_eks_access_policy_association.operator_view` (`terraform/main.tf`) and brings it under management with `import` blocks, so it is **not recreated**.

| Item | Value |
|---|---|
| Cluster | `var.cluster_name` (`CLUSTER_NAME`) |
| Principal | IAM user from `operator_iam_user_name`; ARN built from the account data source (override with `operator_principal_arn`) |
| Kubernetes username | `zein` |
| Access | `AmazonEKSViewPolicy`, scope `cluster`. No Edit or Admin policy, no groups. |

## How the import happens

The import blocks live next to the resources in `terraform/main.tf`. There is nothing to run by hand: the next `terraform-apply` run imports them.

1. Run `terraform-apply`. In `tf-plan`, the import blocks are resolved against the real entry.
2. Read the plan, then approve `tf-apply` as usual. The saved plan file carries the imports, so apply writes them to state without changing AWS.

The IDs are built from variables and the account data source (no ARN in the code):
- entry: `<cluster_name>:<principal_arn>`
- association: `<cluster_name>#<principal_arn>#arn:aws:eks::aws:cluster-access-policy/AmazonEKSViewPolicy`

Needs Terraform 1.6 or newer (expression IDs); the repo pins `>= 1.10` and CI runs 1.16.5.

## Expected plan

- Two lines: `aws_eks_access_entry.operator will be imported` and `aws_eks_access_policy_association.operator_view will be imported`.
- `Plan: 2 to import` plus whatever else is pending. No changes to other resources, and no changes to these two once imported.

If the plan wants to **update** one of them instead of just importing:
- `user_name`: the console username must be exactly `zein`.
- `kubernetes_groups`: the entry must have no groups. If the console added any, remove them in the console rather than ignoring them.
- policy association: it must be `AmazonEKSViewPolicy` at cluster scope only.

If the plan says it will **create** the entry, the IDs did not match an existing entry (wrong cluster name or principal). Stop; do not approve. An approved create against an existing entry fails with `ResourceInUseException`.

## After the import

Once state holds both resources, the blocks do nothing, so they can stay or go:
- **Leaving them in** is harmless: a plan with the resources already in state ignores them, and a rebuilt environment (destroy, then apply) re-imports nothing because the entry is gone, which would fail the plan. Remove them before any destroy and rebuild.
- **Removing them in a follow-up** is the cleaner choice: the code then describes only the steady state, and nothing can fail on a missing entry. Delete the two `import {}` blocks and commit.

Recommended: remove them in a follow-up after the first successful import apply.

## Check

```sh
aws eks describe-access-entry --cluster-name "$CLUSTER_NAME" --principal-arn <principal_arn> \
  --query 'accessEntry.{type:type,user:username,groups:kubernetesGroups}'
aws eks list-associated-access-policies --cluster-name "$CLUSTER_NAME" --principal-arn <principal_arn> \
  --query 'associatedAccessPolicies[].{policy:policyArn,scope:accessScope}'
```

Expect type `STANDARD`, user `zein`, no groups, and only `AmazonEKSViewPolicy` with scope `cluster`.
