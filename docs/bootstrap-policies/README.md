# Bootstrap policies

IAM policies for the CI roles. They are applied by hand and are not managed by Terraform. Terraform and the workflows never create, edit or import the `cloudbatch818-zein-hcsecops-gha-*` roles.

| File | Role | Status |
|---|---|---|
| `plan-policy.json` | `...-gha-plan` | Read-only. Re-synced in SEC-037 (`LogBucketHead`). Note (2026-10-08): it was first recorded as a copy of the live policy. |
| `apply-policy.json` | `...-gha-apply` | This directory. Replaces the policy currently attached. |
| `deploy-dev-policy.json` | the deploy-dev role | New file: the live statements plus `acm:ListCertificates` (see the Helm chart and release pipeline review). |
| `deploy-prod-policy.json` | the deploy-prod role | New file: the live statements plus `acm:ListCertificates` (see the Helm chart and release pipeline review). |

The plan role needs `s3:ListBucket` on the `cloudbatch818-zein-hcsecops-logs-*` buckets (`LogBucketHead` in `plan-policy.json`); without it `HeadBucket` fails during refresh and the provider drops the buckets from state (SEC-037).

## Applying

The files use `<ACCOUNT_ID>` instead of a real account ID. Substitute it, then put the result on the role as the inline policy `apply-policy`:

```sh
sed "s/<ACCOUNT_ID>/$AWS_ACCOUNT_ID/g" docs/bootstrap-policies/apply-policy.json > /tmp/apply-policy.json
aws iam put-role-policy --role-name cloudbatch818-zein-hcsecops-gha-apply \
  --policy-name apply-policy --policy-document file:///tmp/apply-policy.json
```

## Changes from the previous apply policy

| Change | Why |
|---|---|
| `s3:*` limited to `cloudbatch818-zein-hcsecops-logs-*` | The design names log buckets `...-logs-<purpose>-<account-id>`. The broader `cloudbatch818-zein-hcsecops-*` pattern would also match the Terraform state bucket and allow deleting it. State access stays in `TerraformState`. |
| `ssm:GetParameter*` limited to `/aws/service/eks/*` | Public EKS parameters only. Fargate does not need them today; remove if still unused after the EKS on Fargate work (Phase 3). |
| `secretsmanager:*` limited to `cloudbatch818-zein-hcsecops-*` secrets | The stack has one secret. |
| Added `dynamodb:*` on the patients table, `lambda:*` on project functions, `sqs:*` on project queues | New in the Terraform foundation (Phase 2): table, rotation Lambda and its dead-letter queue. |
| Added `budgets:*` on `cloudbatch818-zein-hcsecops-*` budgets | New in the Terraform foundation (Phase 2). Budgets is a global service, so this statement has no region condition. |
| `xray:*` not added | Terraform only sets `tracing_config` on the function; it makes no X-Ray API calls. The function's own role carries `xray:PutTraceSegments`. Add it only if a later phase creates X-Ray groups or sampling rules. |
| Kept `ProtectCiRoles`, `IamProjectOnly`, Route 53 scope | Unchanged. |

## Remaining service wildcards

Action wildcards on `Resource: "*"` (limited to us-east-2 by condition). Owner for all rows: Moulaye. Tightening task: open, not scheduled (older text calls it Phase 7, posture scan and triage; see the [phase map](../phase-map.md)), using the resource names the finished stack actually has.

| Statement | Wildcard | Why it remains | Tightening task (open, not scheduled) |
|---|---|---|---|
| RegionalServices | `ec2:*` | VPC, subnets, NAT, security groups, flow logs; many create calls do not support resource scoping | Replace with the used actions, tag-condition where supported |
| RegionalServices | `kms:*` | `CreateKey` cannot be resource scoped | Split create from key-scoped admin by alias |
| RegionalServices | `eks:*`, `ecr:*`, `logs:*`, `cloudwatch:*`, `elasticloadbalancing:*`, `autoscaling:*` | Used by Phases 2 to 6 | Scope to project ARNs and name prefixes |
| RegionalServices | `sns:*`, `events:*`, `acm:*` | Alerting, event rules, certificates | Scope to project ARNs |
| RegionalServices | `guardduty:*`, `inspector2:*`, `securityhub:*`, `config:*`, `cloudtrail:*`, `wafv2:*` | Security services (older text calls this Phase 5; see the phase map); most are account-level | Reduce to the enable and configure actions |
| IamRead | `iam:Get*`, `iam:List*` on `*` | Provider reads | Keep, read-only |
| ServiceLinkedRoles | `iam:CreateServiceLinkedRole` on `*` | Conditioned on a fixed service list | Prune the list after the security services work (older text: Phase 5) |
| Route53Read | list and get on `*` | Zone lookup | Keep, read-only |

## EKS on Fargate review (Phase 3)

Every new call was checked against both files. Result:

| File | Change | Reason |
|---|---|---|
| `apply-policy.json` | Added `eks-fargate.amazonaws.com` to `ServiceLinkedRoles` | Creating the first Fargate profile creates the service-linked role `AWSServiceRoleForAmazonEKSForFargate`. |
| `apply-policy.json` | No other change | EKS cluster, Fargate profiles, add-on and access entries: `eks:*` (region-scoped). Cluster, Fargate, IRSA and controller roles: `IamProjectOnly` (all are named `cloudbatch818-zein-hcsecops-*`). OIDC provider: `oidc-provider/oidc.eks.us-east-2.amazonaws.com/id/*`. ACM: `acm:*`. Validation records: `Route53` on zone `<ZONE_ID>`. Pod security groups: `ec2:*`. EKS secrets and log encryption: `kms:*`. The cluster-addons Helm and Kubernetes calls go to the Kubernetes API; on AWS they need only `eks:DescribeCluster`. |
| `plan-policy.json` | Added `budgets:ListTagsForResource` (already applied live) | The provider reads budget tags on every refresh; the plan failed without it (SEC-020). |
| `plan-policy.json` | No other change | The root plan reads EKS (`eks:Describe*`, `eks:List*`), ACM, IAM OIDC (`iam:Get*`), Route 53 and Lambda, all already allowed. The plan role gets no cluster access (D2b). |

## Load Balancer Controller policy wildcards (D4)

`terraform/policies/aws-load-balancer-controller-v3.6.0.json` is the upstream policy, attached to the controller's IRSA role unmodified. It has 16 statements; 10 use `Resource: "*"`, mostly guarded by `aws:ResourceTag/elbv2.k8s.aws/cluster` or `aws:RequestTag` conditions. Checkov does not evaluate it (the policy is read with `file()`), so it is reviewed here instead. Owner: Moulaye. Open, not scheduled: scope the unconditioned `Describe*`, `ec2:CreateSecurityGroup`, `elasticloadbalancing:Create*` and WAF/Shield statements to this cluster's tags and the project VPC, and re-check on each controller upgrade.

## Terraform seeding of the patients table

| File | Change | Reason |
|---|---|---|
| `plan-policy.json` | New statement `RefreshSeededPatientItems`: `dynamodb:GetItem` on the patients table ARN only | Once the 30 seed items are in state, every `tf-plan` refreshes each `aws_dynamodb_table_item` with `GetItem`. Without it the plan fails with AccessDenied. Still read-only. The plan role trusts `pull_request` (EXC-004), so a PR job could read these synthetic records. |
| `apply-policy.json` | No change | `dynamodb:*` on the patients table already covers `PutItem`, `GetItem` and `DeleteItem`. |
| App IRSA role | No change | `GetItem`, `Query`, `Scan` only; no write action. |

## Helm chart and release pipeline review (Phase 4)

| File | Change | Reason |
|---|---|---|
| `deploy-dev-policy.json`, `deploy-prod-policy.json` | New files: the live statements (`eks:DescribeCluster` on the cluster, `ecr:DescribeImages` on the repository) plus `acm:ListCertificates` | `cd.yml` looks up the wildcard certificate by domain at deploy time. `acm:ListCertificates` does not support resource scoping, so it is on `*`, read-only and limited to us-east-2. Attach by hand before the first deploy. |
| `apply-policy.json`, `plan-policy.json` | No change | The chart is deployed by the deploy roles, not by Terraform. |

Rotation-aware rollout: both deploy policy files also get `SecretDescribeVersion` (`secretsmanager:DescribeSecret` on the one API key secret; `??????` matches the six-character suffix Secrets Manager adds). It returns version IDs and stages, never the value; the roles still have no `GetSecretValue`. The live policies are changed by hand (SEC-034).

Remaining wildcard, owner Moulaye, open, not scheduled: `acm:ListCertificates` on `*` in both deploy roles. Alternative that removes it: drop `certificate-arn` and let the controller discover the certificate by host.

## Detective controls review, step 1 (Phase 7)

| File | Change | Reason |
|---|---|---|
| `apply-policy.json` | New statements `DetectiveSecurityHub*`, `DetectiveGuardDuty*`, `DetectiveCloudTrail*`, scoped to the hub, the one detector family and the one trail | **Not required for the first apply.** The live apply role already has `securityhub:*`, `guardduty:*`, `cloudtrail:*` and `kms:*` (us-east-2), `s3:*` on `cloudbatch818-zein-hcsecops-logs-*` (the trail bucket is `...-logs-cloudtrail-<account id>`), and the service-linked-role rights for GuardDuty and Security Hub. These statements are the scoped replacement to use if the policy tightening (open, not scheduled) removes those service wildcards. Review the ARN shapes against a real plan before swapping them in; I could not test them offline. |
| KMS | None | The key policy change is in Terraform (`terraform/modules/kms`): a statement for the named trail only. The apply role edits it through `kms:*`. |
