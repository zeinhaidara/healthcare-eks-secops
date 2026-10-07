# Bootstrap

One-time setup done by hand, outside Terraform. Terraform and the workflows only reference these through variables.

## Created manually

- S3 state bucket (name in repo variable `TF_STATE_BUCKET`), versioned and encrypted. Terraform uses native locking (`use_lockfile = true`, Terraform 1.10+), so no DynamoDB lock table.
- GitHub OIDC identity provider in the AWS account.
- One least-privilege IAM role per purpose, each trusting only this repo through OIDC:

| Role | Used by | Access |
|---|---|---|
| plan | `pr-checks.yml` plan step | read-only |
| apply | `terraform.yml` (environment `infra`) | write, scoped to project resources |
| ecr-push | `app-release.yml` push job | push to the project ECR repo |
| deploy-dev | `app-release.yml` dev deploy | namespace-scoped EKS access |
| deploy-prod | `app-release.yml` prod deploy | namespace-scoped EKS access |

- GitHub Environments `infra`, `dev`, `prod`, each requiring approval and limited to `main`.
- GitHub variables (repo and environment level) as listed in the design plan.

## Set manually after Terraform apply

- The API key value in Secrets Manager (set in the console; Terraform creates only the empty secret).

## Rules

- No long-lived AWS keys anywhere.
- Role ARNs, account ID and bucket name are never hardcoded; they arrive as variables.
- `terraform init` uses `-backend-config="bucket=$TF_STATE_BUCKET"`.
