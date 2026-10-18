# Bootstrap policies

IAM policies for the CI roles. They are applied by hand. Terraform and the workflows never create, edit or import the `cloudbatch818-zein-hcsecops-gha-*` roles.

| File | Role | Notes |
|---|---|---|
| `plan-policy.json` | plan | Read-only. Includes `LogBucketHead` (`s3:ListBucket` on the log buckets, SEC-037), `budgets:ListTagsForResource` (SEC-020) and `RefreshSeededPatientItems` (`dynamodb:GetItem` on the patients table only) |
| `apply-policy.json` | apply | Project-scoped write. Includes `SecretsGithubAppRead` (metadata of the Argo CD GitHub App secret, not its value) |
| `deploy-dev-policy.json`, `deploy-prod-policy.json` | deploy-dev, deploy-prod | Unused since 2026-10-15; EKS access removed 2026-10-18 (#151, applied). `eks:DescribeCluster`, `ecr:DescribeImages`, `acm:ListCertificates`, and `secretsmanager:DescribeSecret` on the API key secret |

The ECR push role trusts only `refs/heads/main` and `refs/heads/dev` with audience `sts.amazonaws.com`. Its policy is not tracked here.

## Applying

The files use `<ACCOUNT_ID>`. Substitute it, then put the result on the role as an inline policy:

```sh
sed "s/<ACCOUNT_ID>/$AWS_ACCOUNT_ID/g" docs/bootstrap-policies/apply-policy.json > /tmp/apply-policy.json
aws iam put-role-policy --role-name cloudbatch818-zein-hcsecops-gha-apply \
  --policy-name apply-policy --policy-document file:///tmp/apply-policy.json
```

## Scoping choices in the apply policy

- `s3:*` only on `cloudbatch818-zein-hcsecops-logs-*`, so the role cannot delete the state bucket. State access is in `TerraformState`.
- `secretsmanager:*` only on project secrets. `ssm:GetParameter*` only on `/aws/service/eks/*`.
- `dynamodb:*` on the patients table, `lambda:*` on project functions, `sqs:*` on project queues, `budgets:*` on project budgets.
- `ProtectCiRoles` and `IamProjectOnly` keep IAM writes off the CI roles and on project names only.
- `Detective*` statements are a scoped replacement for the security service wildcards. They are not needed today and their ARN shapes are untested.

## Remaining wildcards

Action wildcards on `Resource: "*"`, limited to us-east-2 by condition. Owner: Moulaye. Tightening is open and not scheduled.

| Statement | Wildcard | Why it remains | Tightening |
|---|---|---|---|
| RegionalServices | `ec2:*` | Many VPC create calls cannot be resource-scoped | Used actions only, tag conditions where supported |
| RegionalServices | `kms:*` | `CreateKey` cannot be resource-scoped | Split create from key admin by alias |
| RegionalServices | `eks:*`, `ecr:*`, `logs:*`, `cloudwatch:*`, `elasticloadbalancing:*`, `autoscaling:*` | Used across the stack | Project ARNs and name prefixes |
| RegionalServices | `sns:*`, `events:*`, `acm:*` | Alerting, event rules, certificates | Project ARNs |
| RegionalServices | `guardduty:*`, `inspector2:*`, `securityhub:*`, `config:*`, `cloudtrail:*`, `wafv2:*` | Security services, mostly account-level | Enable and configure actions only |
| IamRead, Route53Read | `iam:Get*`, `iam:List*`, Route 53 list and get | Provider reads | Keep, read-only |
| ServiceLinkedRoles | `iam:CreateServiceLinkedRole` | Conditioned on a fixed service list | Prune unused services |
| deploy roles | `acm:ListCertificates` | Cannot be resource-scoped | Remove with the roles, which are unused since 2026-10-15 |

## Load Balancer Controller policy

`terraform/policies/aws-load-balancer-controller-v3.6.0.json` is the upstream policy, unmodified. 10 of its 16 statements use `Resource: "*"`, mostly guarded by cluster tag conditions. Checkov does not read it (`file()`), so it is reviewed here. Open: scope the unconditioned `Describe*`, `ec2:CreateSecurityGroup`, `elasticloadbalancing:Create*` and WAF/Shield statements, and re-check on each controller upgrade.
