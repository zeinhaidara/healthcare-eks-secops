# Runbook: detective controls

Security Hub, GuardDuty and CloudTrail, in us-east-2 only. Module: `terraform/modules/detective`. Applied with the root by `terraform-apply.yml`. No steps by hand.

## What gets built, in order

1. The KMS key policy gains a statement for the named trail.
2. Trail bucket `<prefix>-logs-cloudtrail-<account id>`: private, versioned, KMS, TLS only, 365-day expiry, writable only by this trail. Its access logs go to `<prefix>-logs-cloudtrail-access-<account id>` (SSE-S3, EXC-014).
3. CloudTrail: single region, log file validation, KMS. Delivers to the bucket, CloudWatch Logs (`/<prefix>/cloudtrail`) and SNS (`<prefix>-cloudtrail`).
4. GuardDuty detector, 15-minute publishing, with S3 data events and EKS audit logs.
5. Security Hub with the AWS Foundational Security Best Practices standard.

GuardDuty allows one detector per region. If one already exists before a rebuild, adopt it with an `import {}` block, then remove the block.

## Checks

```sh
aws cloudtrail get-trail-status --name <trail name> --query '{logging:IsLogging,last:LatestDeliveryTime,error:LatestDeliveryError}'
aws cloudtrail validate-logs --trail-arn <trail arn> --start-time <ISO time>
```

`LatestDeliveryError` must be empty. A `KMS` or `AccessDenied` error means the key or bucket policy does not match the trail name.

Security Hub control findings need AWS Config, which is not built. Expect "no data" for the FSBP score. GuardDuty findings still arrive. To test, generate a sample finding:

```sh
aws guardduty create-sample-findings --detector-id "$(aws guardduty list-detectors --query 'DetectorIds[0]' --output text)" \
  --finding-types Recon:EC2/PortProbeUnprotectedPort
```

It appears in Security Hub, Findings, product `GuardDuty`, after a few minutes.

## Destructive plan guard

`tf-plan` fails, before the plan is uploaded, if any `aws_s3_bucket`, `aws_s3_bucket_*`, `aws_kms_key` or `aws_dynamodb_table` will be destroyed or replaced (SEC-037). It fails closed on a missing plan or a grep error. Creates, imports and in-place updates pass. Table items, KMS aliases and key policies are not covered.

There is no override. When it fails:

1. Do not rerun hoping it passes. Read the printed lines and the refresh section. A bucket that "has been deleted" but exists means the plan role could not read it.
2. Fix the cause and plan again.
3. A wanted replacement is a separate PR that says why and what data is lost.

## Cost

Estimates, not measured. GuardDuty and Security Hub have a 30-day free trial. After it, roughly $2 to $10 a month, mostly GuardDuty foundational sources, plus Config if it is turned on. This is on top of the $75 budget.

## Known gaps

- Single-region trail: IAM and STS events from us-east-1 are not captured (EXC-010).
- The SNS topic has no subscriber, so nothing is alerted.
- `force_destroy` on both log buckets: the session destroy deletes the audit logs (EXC-013).
