# Runbook: failed Terraform run

Find the failure by its log line.

- **`tf-apply`: `reading ZIP file (modules/.../build/....zip): no such file`.** The Lambda zip is built at plan time on another runner. `tf-plan` must upload `zips.sha256` and the zips, and `tf-apply` must download them (SEC-016). Rerun `terraform-apply`; a partial apply is safe to repeat.
- **`tf-apply`: `execution role does not have permissions to call DeleteNetworkInterface`** on a VPC Lambda. Lambda checks its role at create time, so the EC2 actions of `AWSLambdaVPCAccessExecutionRole` must be on `*` (SEC-027, EXC-009).
- **Plan says an existing S3 bucket "has been deleted" or "will be created".** Do not approve. The plan role could not read the bucket (no `s3:ListBucket`), and the provider treated it as deleted (SEC-037). The destructive plan guard should block it; see [detective-controls.md](detective-controls.md).
- **`addons-apply` hangs on the Argo CD release.** Check `kubectl -n argocd get events --sort-by=.lastTimestamp`. "user group is specified without user" means Fargate rejected a pod. Fix `terraform/cluster-addons/values/argocd.yaml` in a PR. The `securitycontext-check` job catches this case.
- **`tf-plan`: `AccessDenied` on `dynamodb:GetItem` during refresh.** The plan role is missing `RefreshSeededPatientItems` from `plan-policy.json`.
