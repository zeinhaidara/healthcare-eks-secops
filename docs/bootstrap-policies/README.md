# Bootstrap policies

IAM policies for the CI roles. They are applied by hand and are not managed by Terraform. Terraform and the workflows never create, edit or import the `cloudbatch818-zein-hcsecops-gha-*` roles.

| File | Role | Status |
|---|---|---|
| `plan-policy.json` | `...-gha-plan` | Maintained by the owner. Not yet in this branch; add it here when ready. |
| `apply-policy.json` | `...-gha-apply` | This directory. Replaces the policy currently attached. |

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
| `ssm:GetParameter*` limited to `/aws/service/eks/*` | Public EKS parameters only. Fargate does not need them today; remove if still unused after Phase 3. |
| `secretsmanager:*` limited to `cloudbatch818-zein-hcsecops-*` secrets | The stack has one secret. |
| Added `dynamodb:*` on the patients table, `lambda:*` on project functions, `sqs:*` on project queues | New in Phase 2 (table, rotation Lambda and its dead-letter queue). |
| Added `budgets:*` on `cloudbatch818-zein-hcsecops-*` budgets | New in Phase 2. Budgets is a global service, so this statement has no region condition. |
| `xray:*` not added | Terraform only sets `tracing_config` on the function; it makes no X-Ray API calls. The function's own role carries `xray:PutTraceSegments`. Add it only if a later phase creates X-Ray groups or sampling rules. |
| Kept `ProtectCiRoles`, `IamProjectOnly`, Route 53 scope | Unchanged. |

## Remaining service wildcards

Action wildcards on `Resource: "*"` (limited to us-east-2 by condition). Owner for all rows: Moulaye. Tightening task: Phase 7 (posture scan and triage), using the resource names the finished stack actually has.

| Statement | Wildcard | Why it remains | Phase 7 task |
|---|---|---|---|
| RegionalServices | `ec2:*` | VPC, subnets, NAT, security groups, flow logs; many create calls do not support resource scoping | Replace with the used actions, tag-condition where supported |
| RegionalServices | `kms:*` | `CreateKey` cannot be resource scoped | Split create from key-scoped admin by alias |
| RegionalServices | `eks:*`, `ecr:*`, `logs:*`, `cloudwatch:*`, `elasticloadbalancing:*`, `autoscaling:*` | Used by Phases 2 to 6 | Scope to project ARNs and name prefixes |
| RegionalServices | `sns:*`, `events:*`, `acm:*` | Alerting, event rules, certificates | Scope to project ARNs |
| RegionalServices | `guardduty:*`, `inspector2:*`, `securityhub:*`, `config:*`, `cloudtrail:*`, `wafv2:*` | Phase 5 security services; most are account-level | Reduce to the enable and configure actions |
| IamRead | `iam:Get*`, `iam:List*` on `*` | Provider reads | Keep, read-only |
| ServiceLinkedRoles | `iam:CreateServiceLinkedRole` on `*` | Conditioned on a fixed service list | Prune the list after Phase 5 |
| Route53Read | list and get on `*` | Zone lookup | Keep, read-only |
