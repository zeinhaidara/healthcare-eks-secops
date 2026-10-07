# Bootstrap

One-time setup done by hand, outside Terraform. Terraform and the workflows only reference these through variables.

## Created manually

- S3 state bucket (name in repo variable `TF_STATE_BUCKET`), versioned and encrypted. Terraform uses native locking (`use_lockfile = true`, Terraform 1.10+), so no DynamoDB lock table.
- GitHub OIDC identity provider in the AWS account.
- One least-privilege IAM role per purpose, each trusting only this repo through OIDC:

| Role | Used by | Access |
|---|---|---|
| plan | `terraform-plan.yml` | read-only on state |
| apply | `terraform-apply.yml` (environment `infra`) | write, scoped to project resources |
| ecr-push | `app-release.yml` push job | push to the project ECR repo |
| deploy-dev | `app-release.yml` dev deploy | namespace-scoped EKS access |
| deploy-prod | `app-release.yml` prod deploy | namespace-scoped EKS access |

- GitHub Environments `infra`, `dev`, `prod`, each requiring approval and limited to `main`.
- GitHub variables (repo and environment level) as listed in the design plan.

## Set manually after Terraform apply

- The API key value in Secrets Manager. Terraform creates only the empty, KMS-encrypted secret so the key never enters Terraform state.
  1. Generate a random value (password manager or `openssl rand -base64 32`).
  2. In the console (us-east-2), open the secret, choose Retrieve secret value, then Edit.
  3. Use the Plaintext tab, paste the value, and save.
  4. Keep a copy in your password manager for testing `/patients`.
- The app reads the secret itself at startup through its IRSA role. Until the value is set, the pod stays not-ready (`/ready` returns 503) by design.
- To rotate: repeat the steps above, then restart the pods.

## Rules

- No long-lived AWS keys anywhere.
- Role ARNs, account ID and bucket name are never hardcoded; they arrive as variables.
- `terraform init` uses `-backend-config="bucket=$TF_STATE_BUCKET"`.