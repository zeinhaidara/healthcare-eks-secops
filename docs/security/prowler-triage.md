# Prowler triage (2026-10-10 scan)

Triage of the first Prowler scan against the exceptions register and the improvement log. Plain facts for the findings report; no resource names, identities or account IDs.

## Scan

| Item | Value |
|---|---|
| Scan time (as recorded in the CSV) | 2026-10-10 22:51:39 |
| Tool | Prowler 5.44.0, AWS provider, all checks (no compliance filter) |
| Identity | Operator read-only identity (AWS CLI profile) |
| Scope | us-east-2 (7,319 results) plus global checks reported under us-east-1 (366); 1 result under af-south-1 |
| Source | `evidence/security/prowler/prowler-output-<ACCOUNT_ID>-20261010225139.csv` (local only, not committed) |

**Totals:** 7,686 results: 5,633 PASS, 2,019 FAIL, 34 MANUAL. 22 muted, 0 of them FAIL.

### The account is shared

The scanned AWS account also hosts other teams' workloads (other Project tags, IAM users, CloudFront, API Gateway, RDS, ECS and more). Only **43 of the 2,019 FAIL results** are on this project's resources (name prefix, the project's Owner and Project tags, or the operator IAM user). The rest are listed for completeness and classified as out of scope: either another workload's resource, or an account-level setting that belongs to the account owner. The register covers this project only.

## FAIL counts

By severity:

| Severity | Account (all FAIL) | This project |
|---|---:|---:|
| critical | 14 | 0 |
| high | 441 | 15 |
| medium | 1,023 | 17 |
| low | 541 | 11 |
| **total** | **2,019** | **43** |

By service (Prowler `SERVICE_NAME`):

| Service | Account (all FAIL) | This project |
|---|---:|---:|
| s3 | 510 | 16 |
| iam | 460 | 9 |
| awslambda | 196 | 1 |
| cloudfront | 191 | 0 |
| cloudwatch | 175 | 0 |
| apigateway | 104 | 0 |
| ec2 | 96 | 0 |
| ecr | 52 | 2 |
| secretsmanager | 34 | 1 |
| apigatewayv2 | 28 | 0 |
| dynamodb | 23 | 2 |
| elbv2 | 21 | 0 |
| cloudtrail | 17 | 2 |
| stepfunctions | 12 | 0 |
| vpc | 12 | 1 |
| ecs | 11 | 0 |
| kms | 10 | 0 |
| route53 | 10 | 0 |
| sns | 9 | 0 |
| rds | 7 | 0 |
| guardduty | 6 | 6 |
| cloudformation | 5 | 0 |
| eks | 5 | 2 |
| networkfirewall | 4 | 1 |
| wafv2 | 4 | 0 |
| organizations | 3 | 0 |
| codebuild | 2 | 0 |
| config | 2 | 0 |
| accessanalyzer | 1 | 0 |
| account | 1 | 0 |
| autoscaling | 1 | 0 |
| backup | 1 | 0 |
| inspector2 | 1 | 0 |
| macie | 1 | 0 |
| sagemaker | 1 | 0 |
| securityhub | 1 | 0 |
| sqs | 1 | 0 |
| ssmincidents | 1 | 0 |

Top 15 checks by FAIL count (account-wide):

| Check ID | Severity | FAIL | This project |
|---|---|---:|---:|
| `cloudwatch_log_group_kms_encryption_enabled` | medium | 124 | 0 |
| `iam_role_cross_service_confused_deputy_prevention` | high | 107 | 2 |
| `s3_bucket_no_mfa_delete` | medium | 60 | 3 |
| `s3_bucket_object_lock` | low | 60 | 3 |
| `awslambda_function_invoke_api_operations_cloudtrail_logging_enabled` | low | 59 | 1 |
| `s3_bucket_cross_region_replication` | low | 59 | 3 |
| `awslambda_function_inside_vpc` | low | 58 | 0 |
| `awslambda_function_no_dead_letter_queue` | medium | 58 | 0 |
| `s3_bucket_event_notifications_enabled` | low | 57 | 1 |
| `s3_bucket_server_access_logging_enabled` | medium | 57 | 2 |
| `s3_bucket_kms_encryption` | medium | 56 | 2 |
| `s3_bucket_secure_transport_policy` | medium | 55 | 1 |
| `iam_user_hardware_mfa_enabled` | high | 51 | 1 |
| `iam_policy_attached_only_to_group_or_roles` | low | 50 | 1 |
| `iam_user_mfa_enabled_console_access` | high | 50 | 1 |

## Critical and high checks

Classification applies to this project's resources in the row. "FAIL" is the account-wide count; "Project" is the part on this project's resources.

| Check ID | Severity | Service | Resource type | FAIL | Project | Classification | Reference |
|---|---|---|---|---:|---:|---|---|
| `awslambda_function_not_publicly_accessible` | critical | awslambda | AwsLambdaFunction | 3 | 0 | Out of scope: other workload | - |
| `iam_aws_attached_policy_no_administrative_privileges` | critical | iam | AwsIamPolicy | 1 | 0 | Out of scope: other workload | - |
| `iam_inline_policy_no_administrative_privileges` | critical | iam | AwsIamPolicy | 1 | 0 | Out of scope: other workload | - |
| `iam_no_root_access_key` | critical | iam | AwsIamAccessKey | 1 | 0 | Out of scope: account owner | - |
| `iam_root_hardware_mfa_enabled` | critical | iam | AwsIamUser | 1 | 0 | Out of scope: account owner | - |
| `iam_user_administrator_access_policy` | critical | iam | AwsIamUser | 3 | 0 | Out of scope: other workload | - |
| `kms_cmk_not_deleted_unintentionally` | critical | kms | AwsKmsKey | 2 | 0 | Out of scope: other workload | project key passes |
| `s3_bucket_public_access` | critical | s3 | AwsS3Bucket | 1 | 0 | Out of scope: other workload | - |
| `sqs_queues_not_publicly_accessible` | critical | sqs | AwsSqsQueue | 1 | 0 | Out of scope: other workload | - |
| `awslambda_function_url_public` | high | awslambda | AwsLambdaFunction | 3 | 0 | Out of scope: other workload | - |
| `cloudfront_distributions_default_root_object` | high | cloudfront | AwsCloudFrontDistribution | 9 | 0 | Out of scope: other workload | - |
| `cloudfront_distributions_s3_origin_non_existent_bucket` | high | cloudfront | AwsCloudFrontDistribution | 7 | 0 | Out of scope: other workload | - |
| `cloudwatch_alarm_actions_alarm_state_configured` | high | cloudwatch | AwsCloudWatchAlarm | 6 | 0 | Out of scope: other workload | - |
| `codebuild_project_uses_allowed_github_organizations` | high | codebuild | AwsCodeBuildProject | 1 | 0 | Out of scope: other workload | - |
| `config_delegated_admin_and_org_aggregator_all_regions` | high | config | AwsConfigConfigurationAggregator | 1 | 0 | Expected and deferred | AWS Config planned, not built (controls.md section 7) |
| `ec2_ebs_default_encryption` | high | ec2 | AwsEc2Volume | 1 | 0 | Out of scope: account owner | - |
| `ec2_ebs_snapshot_account_block_public_access` | high | ec2 | AwsEc2Volume | 1 | 0 | Out of scope: account owner | - |
| `ec2_ebs_volume_encryption` | high | ec2 | AwsEc2Volume | 10 | 0 | Out of scope: other workload | - |
| `ec2_ebs_volume_snapshots_exists` | high | ec2 | AwsEc2Volume | 11 | 0 | Out of scope: other workload | - |
| `ec2_instance_account_imdsv2_enabled` | high | ec2 | AwsEc2Instance | 1 | 0 | Out of scope: account owner | - |
| `ec2_instance_internet_facing_with_instance_profile` | high | ec2 | AwsEc2Instance | 5 | 0 | Out of scope: other workload | - |
| `ec2_launch_template_no_public_ip` | high | ec2 | AwsEc2LaunchTemplate | 1 | 0 | Out of scope: other workload | - |
| `ec2_networkacl_allow_ingress_any_port` | high | ec2 | AwsEc2NetworkAcl | 4 | 0 | Out of scope: other workload | - |
| `ec2_securitygroup_default_restrict_traffic` | high | ec2 | AwsEc2SecurityGroup | 1 | 0 | Out of scope: other workload | - |
| `ecr_repository_image_no_secrets` | high | ecr | AwsEcrRepository | 11 | 1 | New | N3 |
| `ecs_task_definitions_containers_readonly_access` | high | ecs | AwsEcsTaskDefinition | 5 | 0 | Out of scope: other workload | - |
| `eks_cluster_deletion_protection_enabled` | high | eks | AwsEksCluster | 2 | 1 | New | N5 |
| `eks_cluster_not_publicly_accessible` | high | eks | AwsEksCluster | 2 | 1 | Covered | EXC-005, SEC-018 |
| `guardduty_ai_protection_enabled` | high | guardduty | AwsGuardDutyDetector | 1 | 1 | New | N6 |
| `guardduty_delegated_admin_enabled_all_regions` | high | guardduty | AwsGuardDutyDetector | 1 | 1 | Covered | EXC-011 |
| `guardduty_no_high_severity_findings` | high | guardduty | AwsGuardDutyDetector | 1 | 1 | New | N7 |
| `guardduty_runtime_monitoring_enabled` | high | guardduty | AwsGuardDutyDetector | 1 | 1 | New | N6 |
| `iam_administrator_access_with_mfa` | high | iam | AwsIamGroup | 1 | 0 | Out of scope: other workload | - |
| `iam_avoid_root_usage` | high | iam | AwsIamUser | 1 | 0 | Out of scope: account owner | - |
| `iam_group_administrator_access_policy` | high | iam | AwsIamGroup | 2 | 0 | Out of scope: other workload | - |
| `iam_inline_policy_allows_privilege_escalation` | high | iam | AwsIamPolicy | 28 | 1 | Expected and deferred | apply-policy wildcards, Phase 7 ([bootstrap README](../bootstrap-policies/README.md)) |
| `iam_inline_policy_no_full_access_to_cloudtrail` | high | iam | AwsIamPolicy | 4 | 1 | Expected and deferred | apply-policy `cloudtrail:*`, Phase 7 ([bootstrap README](../bootstrap-policies/README.md)) |
| `iam_policy_allows_privilege_escalation` | high | iam | AwsIamPolicy | 30 | 0 | Out of scope: other workload | - |
| `iam_role_administratoraccess_policy` | high | iam | AwsIamRole | 6 | 0 | Out of scope: other workload | - |
| `iam_role_cross_service_confused_deputy_prevention` | high | iam | AwsIamRole | 107 | 2 | New | N1 |
| `iam_root_credentials_management_enabled` | high | iam | Other | 1 | 0 | Out of scope: account owner | - |
| `iam_user_hardware_mfa_enabled` | high | iam | AwsIamUser | 51 | 1 | New | N2 |
| `iam_user_mfa_enabled_console_access` | high | iam | AwsIamUser | 50 | 1 | New | N2 |
| `iam_user_with_temporary_credentials` | high | iam | AwsIamUser | 18 | 1 | Covered | SEC-029 residual risk (operator access key) |
| `kms_cmk_rotation_enabled` | high | kms | AwsKmsKey | 5 | 0 | Out of scope: other workload | project key passes |
| `organizations_scp_check_deny_regions` | high | organizations | Other | 1 | 0 | Out of scope: account owner | - |
| `rds_instance_protected_by_backup_plan` | high | rds | AwsRdsDbInstance | 1 | 0 | Out of scope: other workload | - |
| `route53_domains_transferlock_enabled` | high | route53 | Other | 5 | 0 | Out of scope: account owner | see note A1 |
| `s3_account_level_public_access_blocks` | high | s3 | AwsS3AccountPublicAccessBlock | 1 | 0 | Out of scope: account owner | - |
| `s3_bucket_cross_account_access` | high | s3 | AwsS3Bucket | 3 | 0 | Out of scope: other workload | - |
| `s3_bucket_level_public_access_block` | high | s3 | AwsS3Bucket | 4 | 0 | Out of scope: other workload | - |
| `secretsmanager_automatic_rotation_enabled` | high | secretsmanager | AwsSecretsManagerSecret | 9 | 0 | Out of scope: other workload | project secret passes |
| `secretsmanager_has_restrictive_resource_policy` | high | secretsmanager | AwsSecretsManagerSecret | 11 | 1 | New | N4 |
| `securityhub_delegated_admin_enabled_all_regions` | high | securityhub | AwsSecurityHubHub | 1 | 0 | New | N8 |
| `sns_topics_kms_encryption_at_rest_enabled` | high | sns | AwsSnsTopic | 9 | 0 | Out of scope: other workload | - |
| `vpc_endpoint_connections_trust_boundaries` | high | vpc | AwsEc2VpcEndpointService | 1 | 0 | Out of scope: other workload | - |
| `vpc_subnet_no_public_ip_by_default` | high | vpc | AwsEc2Subnet | 3 | 0 | Out of scope: other workload | - |
| `wafv2_webacl_with_rules` | high | wafv2 | AwsWafv2WebAcl | 2 | 0 | Out of scope: other workload | WAF planned, not built (controls.md section 7) |

58 critical and high checks: 3 covered, 3 expected and deferred, 10 new, 32 out of scope: other workload, 10 out of scope: account owner.

## New

Not covered by a register entry. Proposals only; no rows have been added to the register.

- **N1 Confused-deputy conditions on two service roles** (`iam_role_cross_service_confused_deputy_prevention`, 2 project roles: the rotation Lambda role and the VPC flow logs role). Their trust policies allow the service principal without `aws:SourceAccount` or `aws:SourceArn`. Other project trust policies (detective, EKS, KMS) already use these conditions. Proposal: add them in Terraform. Owner Moulaye, fix by 2026-11-30.
- **N2 Operator IAM user has no MFA** (`iam_user_hardware_mfa_enabled`, `iam_user_mfa_enabled_console_access`, 1 user each). The read-only operator user has a console password and no MFA device. SEC-029 records its long-lived access key as a residual risk but not the missing MFA. Proposal: enable MFA now; the planned move to IAM Identity Center removes the user. Owner Moulaye, fix by 2026-10-31.
- **N3 Secret patterns in the API image** (`ecr_repository_image_no_secrets`, 1 image). All 77 hits are generic "username and password" patterns in base-image OS files and Python standard-library and site-packages files; none are in the application paths (`src`, `static`, `data`). Likely a false positive. The CI image scan already runs Trivy with the secret scanner and fails on HIGH and CRITICAL. Proposal: record as a false positive with that evidence, or mute the check for this repository only. Owner Moulaye, expiry 2027-04-08 if muted.
- **N4 API key secret has no resource policy** (`secretsmanager_has_restrictive_resource_policy`, 1 secret). Terraform defines no `aws_secretsmanager_secret_policy`; access is controlled by IAM and the KMS key policy only. Prowler's message also allows that the scanning identity could not read the policy. Proposal: decide between a deny-by-default resource policy (allow the rotation Lambda and the app roles) and an exception. Owner Moulaye, decide by 2026-11-30.
- **N5 EKS deletion protection off** (`eks_cluster_deletion_protection_enabled`, 1 project cluster). Deletion protection would block the session destroy, the same trade-off as EXC-013. Proposal: accept with an exception. Owner Moulaye, expiry 2027-04-08.
- **N6 GuardDuty Runtime Monitoring and AI Protection off** (`guardduty_runtime_monitoring_enabled`, `guardduty_ai_protection_enabled`, the project-managed detector). The module enables S3 data events and EKS audit logs only. Runtime Monitoring on Fargate needs the GuardDuty security agent and adds cost; AI Protection has nothing to protect here. Proposal: accept AI Protection as not applicable; decide Runtime Monitoring with a cost estimate. Owner Moulaye, expiry 2027-04-08.
- **N7 GuardDuty reports high-severity findings** (`guardduty_no_high_severity_findings`: 4 high-severity findings on the detector). The detector covers the whole region of a shared account, so these may come from other workloads, or from sample findings generated during the Phase 7 check. Not reviewed yet; their origin is unknown. Proposal: review the four findings in the GuardDuty console, record the result here, and archive or act. Owner Moulaye, review by 2026-10-17.
- **N8 Security Hub has no delegated administrator** (`securityhub_delegated_admin_enabled_all_regions`). An organization-level check that a standalone account cannot satisfy, the same reason as EXC-011 for GuardDuty. Proposal: extend EXC-011 to cover it. Owner Moulaye, expiry 2027-04-08.

## Out of scope

- **Other workloads:** every critical finding and most high findings are on other teams' resources in the shared account (public Lambda functions and function URLs, a public bucket and queue, admin IAM users and policies, CloudFront, EC2, RDS, KMS keys pending deletion). The project KMS key and the project secret pass the matching checks.
- **Account owner:** account-level settings that the project does not manage: a root access key exists, root has no hardware MFA, root usage, root credentials management, no account-level S3 public access block, EBS default encryption and snapshot public access block, the IMDSv2 account default, no region-deny SCP. These are worth raising with the account owner, but they are not project items.
- **A1:** `route53_domains_transferlock_enabled` lists registered domains in the account. Check whether the project domain is one of them; if it is, the transfer lock becomes a project item.

## Notes

- The scan ran under the operator read-only identity. Checks that need permissions this identity lacks may report FAIL or skip a resource (N4 is one possible case).
- Only us-east-2 and the global checks were covered. Resources in other regions were not assessed.
- Medium and low results are not classified here. On this project's resources they are: `s3_bucket_cross_region_replication` (3), `s3_bucket_no_mfa_delete` (3), `s3_bucket_object_lock` (3), `s3_bucket_kms_encryption` (2), `s3_bucket_server_access_logging_enabled` (2), `awslambda_function_invoke_api_operations_cloudtrail_logging_enabled` (1), `cloudtrail_bucket_requires_mfa_delete` (1), `cloudtrail_insights_exist` (1), `dynamodb_table_deletion_protection_enabled` (1), `dynamodb_table_protected_by_backup_plan` (1), `ecr_repositories_scan_vulnerabilities_in_latest_image` (1), `guardduty_centrally_managed` (1), `guardduty_eks_runtime_monitoring_enabled` (1), `iam_inline_policy_no_full_access_to_kms` (1), `iam_policy_attached_only_to_group_or_roles` (1), `networkfirewall_in_all_vpc` (1), `s3_bucket_event_notifications_enabled` (1), `s3_bucket_lifecycle_enabled` (1), `s3_bucket_secure_transport_policy` (1), `vpc_endpoint_for_ec2_enabled` (1).
- The raw CSV, HTML and compliance outputs stay local. Their file names contain the account ID and their rows contain resource names and identities.
