# Runbook: failed deploy

Recognise a known failure by its log line.

- `tf-apply`: `reading ZIP file (modules/.../build/....zip): ... no such file or directory`. The Lambda zip is built during plan on another runner. `tf-plan` must upload `zips.sha256` and `modules/*/build/*.zip` with the plan, and `tf-apply` must download them (SEC-016). Rerun `terraform-apply`; a partial apply is safe to repeat because the plan is recomputed.
- `tf-apply`: `InvalidParameterValueException: The provided execution role does not have permissions to call DeleteNetworkInterface on EC2` on a VPC Lambda. Lambda checks its execution role at create time, before any network interface exists; the EC2 actions of `AWSLambdaVPCAccessExecutionRole` must be on `*`, not ARN- or condition-scoped (SEC-027).
- `tf-plan` or `tf-apply` (S3 bucket): `module.<name>.aws_s3_bucket.<name> has been deleted` in the refresh section, a plan that says an existing bucket "will be created", and sub-resources with `forces replacement` on `bucket`. Do not approve `tf-apply`. The bucket still exists; the plan role could not read it (no `s3:ListBucket` on it) and the provider treated that as "deleted". Applying it destroys the bucket's configuration, then fails with `BucketAlreadyOwnedByYou` (SEC-037).
