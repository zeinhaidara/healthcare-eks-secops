# Runbook: operator access entry (imported, now managed normally)

The operator entry was created by hand in the EKS console. It was brought under Terraform with `import` blocks. **The import ran once, the blocks were removed afterward, and the resources are now managed normally** as `aws_eks_access_entry.operator` and `aws_eks_access_policy_association.operator_view` in `terraform/main.tf`.

| Item | Value |
|---|---|
| Cluster | `var.cluster_name` (`CLUSTER_NAME`) |
| Principal | IAM user from `operator_iam_user_name`; ARN built from the account data source (override with `operator_principal_arn`) |
| Kubernetes username | `zein` |
| Access | `AmazonEKSViewPolicy`, scope `cluster`. No Edit or Admin policy, no groups. |

## What happened

1. The entry was created by hand in the console.
2. Two `import {}` blocks (IDs built from variables, no ARN in code) were added; the normal `terraform-apply` plan showed them as "will be imported", and `tf-apply` wrote them to state without changing AWS.
3. The blocks were removed in a follow-up (`chore: remove operator import blocks after import`). They did nothing once the resources were in state, and a destroy-and-rebuild with the blocks still present would fail the plan because the console entry would no longer exist.

## Day to day

Change the entry only through Terraform (variables `operator_principal_arn`, `operator_iam_user_name`, `operator_kubernetes_username`). A change made in the console shows up as a plan diff on the next run. Do not add Edit or Admin policies to the operator; access beyond View needs a review.

## If you ever need to import again

Add `import {}` blocks next to the resources (Terraform 1.6 or newer for expression IDs; the repo pins `>= 1.10`) with:
- entry: `<cluster_name>:<principal_arn>`
- association: `<cluster_name>#<principal_arn>#arn:aws:eks::aws:cluster-access-policy/AmazonEKSViewPolicy`

Read the plan before approving: it must say "will be imported". If it says "will be created", the IDs did not match an existing entry; stop. Remove the blocks again after the apply.

## Check

```sh
aws eks describe-access-entry --cluster-name "$CLUSTER_NAME" --principal-arn <principal_arn> \
  --query 'accessEntry.{type:type,user:username,groups:kubernetesGroups}'
aws eks list-associated-access-policies --cluster-name "$CLUSTER_NAME" --principal-arn <principal_arn> \
  --query 'associatedAccessPolicies[].{policy:policyArn,scope:accessScope}'
```

Expect type `STANDARD`, user `zein`, no groups, and only `AmazonEKSViewPolicy` with scope `cluster`.
