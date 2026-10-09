# Runbook: import the operator access entry

The operator entry was created by hand in the EKS console. Terraform manages it as `aws_eks_access_entry.operator` and `aws_eks_access_policy_association.operator_view` (`terraform/main.tf`), so it must be **imported**, not recreated.

| Item | Value |
|---|---|
| Cluster | `cloudbatch818-zein-hcsecops` |
| Principal | IAM user `moulaye.haidara@techconsulting.tech` (ARN built from the account and `operator_iam_user_name`; override with `operator_principal_arn`) |
| Kubernetes username | `zein` |
| Access | `AmazonEKSViewPolicy`, scope `cluster`. No Edit or Admin policy, no groups. |

## Import (run once)

Run from CI or with the apply role, in `terraform/`, after `terraform init` with the backend config. Use the cluster name and principal ARN for your account:

```sh
terraform import 'aws_eks_access_entry.operator' '<cluster_name>:<principal_arn>'
terraform import 'aws_eks_access_policy_association.operator_view' '<cluster_name>#<principal_arn>#arn:aws:eks::aws:cluster-access-policy/AmazonEKSViewPolicy'
```

For this cluster:

```sh
terraform import 'aws_eks_access_entry.operator' 'cloudbatch818-zein-hcsecops:arn:aws:iam::<ACCOUNT_ID>:user/moulaye.haidara@techconsulting.tech'
terraform import 'aws_eks_access_policy_association.operator_view' 'cloudbatch818-zein-hcsecops#arn:aws:iam::<ACCOUNT_ID>:user/moulaye.haidara@techconsulting.tech#arn:aws:eks::aws:cluster-access-policy/AmazonEKSViewPolicy'
```

Notes:
- These run **once**. Importing writes state only; it changes nothing in AWS.
- Import before the first `tf-apply` that contains these resources. If `tf-apply` runs first, it fails with `ResourceInUseException` because the entry already exists.
- Needs the apply role (it can read and write state). The plan role is read-only and must not be used.

## Expected plan afterward

The plan shows **no changes** for these two resources. If it shows an update:
- `user_name`: the console username must be exactly `zein`.
- `kubernetes_groups`: the entry must have no groups. If the console added any, remove them in the console rather than ignoring them.
- policy association: it must be `AmazonEKSViewPolicy` at cluster scope only.

## Check

```sh
aws eks describe-access-entry --cluster-name cloudbatch818-zein-hcsecops --principal-arn <principal_arn> \
  --query 'accessEntry.{type:type,user:username,groups:kubernetesGroups}'
aws eks list-associated-access-policies --cluster-name cloudbatch818-zein-hcsecops --principal-arn <principal_arn> \
  --query 'associatedAccessPolicies[].{policy:policyArn,scope:accessScope}'
```

Expect type `STANDARD`, user `zein`, no groups, and only `AmazonEKSViewPolicy` with scope `cluster`.
