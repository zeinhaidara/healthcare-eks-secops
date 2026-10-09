# Runbook: Phase 7 detective controls (Security Hub, GuardDuty, CloudTrail)

Region us-east-2 only. Terraform module: `terraform/modules/detective`. Applied with the rest of the root by `terraform-apply.yml` (read the plan in `tf-plan`, then approve `tf-apply`).

## Enable order

Terraform orders it; this is what happens and why:
1. **KMS key policy** gains a statement for the named trail (in-place update of the existing key).
2. **Trail bucket** `<prefix>-logs-cloudtrail-<account id>`: public access blocked, versioning, KMS default encryption, lifecycle (logs expire after 365 days), TLS-only policy, and a policy that lets only this trail write.
3. **CloudTrail trail** (single region, log file validation on, KMS-encrypted). It is created after the bucket policy.
4. **GuardDuty detector** (15-minute publishing) with the S3 data events and EKS audit logs features.
5. **Security Hub** account, then the AWS Foundational Security Best Practices standard.

Nothing needs manual steps. The live apply role already has the permissions (`docs/bootstrap-policies/README.md`).

## Cost note

Estimates, not measured. GuardDuty and Security Hub include a 30-day free trial on first enablement, so month one is mostly free.

| Item | Driver | Rough monthly cost for this small stack |
|---|---|---|
| Security Hub (security checks) | per check; first 100,000 checks per month in the lowest tier. Control findings need AWS Config (priced separately, per configuration item) | a few dollars if Config is on; about zero without it |
| Security Hub (findings) | free for security checks; 10,000 other finding events per month free | near zero |
| GuardDuty foundational sources | CloudTrail management events, VPC flow logs and DNS logs, per volume | about $1 to $5 |
| GuardDuty S3 data events | per million events (first 500 million at $0.80 per million) | near zero (few buckets, low traffic) |
| GuardDuty EKS audit logs | per million audit logs, volume-discounted | well under $1 on a small cluster |
| CloudTrail | the first copy of management events is free; the cost is S3 storage and KMS requests | under $1 |

Total: very roughly $2 to $10 a month after the free trials, depending mostly on Config. Check the real numbers in the Billing console and the Security Hub and GuardDuty usage pages after a few days. This is on top of the $75 budget.

## Check that Security Hub shows findings after enablement

Control findings from the FSBP standard depend on AWS Config recording, which is **not** part of this module. Without Config, expect an empty or "no data" security score. GuardDuty findings still reach Security Hub on their own.

1. Console: Security Hub, Summary. The account should show as enabled with the FSBP standard listed.
2. Generate GuardDuty sample findings (an AWS write action, run by the operator):
   ```sh
   aws guardduty create-sample-findings --detector-id "$(aws guardduty list-detectors --query 'DetectorIds[0]' --output text)" \
     --finding-types Recon:EC2/PortProbeUnprotectedPort
   ```
3. After a few minutes, Security Hub, Findings, filter product name `GuardDuty`: the sample finding appears.
4. If FSBP controls show "no data" after about a day, turn on AWS Config recording (service-linked recorder), then turn the standard off and on again.

Trail checks:
```sh
aws cloudtrail get-trail-status --name <trail name> --query '{logging:IsLogging,last:LatestDeliveryTime,error:LatestDeliveryError}'
aws cloudtrail validate-logs --trail-arn <trail arn> --start-time <ISO time>
aws s3 ls "s3://<trail bucket>/AWSLogs/" --recursive | head
```
`LatestDeliveryError` must be empty. A `KMS` or `AccessDenied` error means the key policy or the bucket policy does not match the trail name.

## Known gaps

- The trail is single-region (us-east-2). IAM and STS events originate in us-east-1 and are not captured.
- No CloudWatch Logs integration, SNS topic or S3 access logging on the trail bucket yet (Checkov findings below).
- `force_destroy` is true on the trail bucket so the session destroy works, which deletes the audit logs with the stack.
