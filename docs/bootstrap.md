# Bootstrap

One-time setup done by hand, outside Terraform. Terraform and the workflows only reference these through variables.

## Created manually

- S3 state bucket (name in repo variable `TF_STATE_BUCKET`), versioned and encrypted. Terraform uses native locking (`use_lockfile = true`, Terraform 1.10+), so no DynamoDB lock table.
- GitHub OIDC identity provider in the AWS account.
- One least-privilege IAM role per purpose, each trusting only this repo through OIDC:

| Role | Used by | Access |
|---|---|---|
| plan | `terraform-apply.yml` job `tf-plan` | read-only on resources, lock file only on state (`docs/bootstrap-policies/plan-policy.json`) |
| apply | `tf-apply` (environment `infra`) and `terraform-destroy.yml` (environment `infra-destroy`) | write, scoped to project resources (`docs/bootstrap-policies/apply-policy.json`) |
| ecr-push | `cd.yml` job `push` | push to the project ECR repo |
| deploy-dev | `cd.yml` job `deploy-dev` | namespace-scoped EKS access |
| deploy-prod | `cd.yml` job `deploy-prod` | namespace-scoped EKS access |

- GitHub Environments `infra`, `infra-destroy`, `dev`, `prod`, each requiring approval and limited to `main`. `infra` and `infra-destroy` each hold `AWS_ROLE_ARN` (the apply role). The apply role's trust policy must allow the `environment:infra` and `environment:infra-destroy` subjects.
- IAM policies for the CI roles are in `docs/bootstrap-policies/` and are applied by hand, never by Terraform.
- GitHub variables (repo and environment level) as listed in the design plan.

## Set manually after Terraform apply

- The API key value in Secrets Manager. Terraform creates only the empty, KMS-encrypted secret so the key never enters Terraform state.
  1. Generate a random value (password manager or `openssl rand -base64 32`).
  2. In the console (us-east-2), open the secret, choose Retrieve secret value, then Edit.
  3. Use the Plaintext tab, paste the value, and save.
  4. Keep a copy in your password manager for testing `/patients`.
- The app reads the secret itself at startup through its IRSA role. Until the value is set, the pod stays not-ready (`/ready` returns 503) by design.
- Rotation is automatic every 30 days (Lambda `cloudbatch818-zein-hcsecops-rotate-api-key`). After any rotation, restart the pods; see `docs/runbooks/rotation.md`.
- Destroying the stack deletes the secret immediately (recovery window 0), so set a new value after every apply.

## Code scanning and quality (CodeQL, SonarCloud)

- CodeQL needs no secrets. The repo is public, so code scanning upload to the Security tab works without extra licensing.
- SonarCloud, set by hand:
  - secret `SONAR_TOKEN` (repo secret)
  - variables `SONAR_PROJECT_KEY` and `SONAR_ORGANIZATION` (repo variables)
  - Without them the `sonar` job fails on purpose with a message naming what is missing.
  - SonarCloud free plan: the quality gate is enforced on pull requests only. Push runs upload the analysis but do not wait for gate status, because the free plan cannot return it for non-main branches.
- `main` ruleset settings changed by hand: required approvals 0 (see EXC-003, SEC-009), code scanning requirement removed (SEC-010), required status checks `app-test-lint`, `app-trivy`, `app-checkov`, `tf-validate`, `tf-checkov`, `codeql`, `sonar`, block force push, restrict deletions, "Require deployments to succeed" off.
- Merge method: merge commits only (no squash, no rebase).

## Phase 3 (EKS) manual steps

1. Attach the updated `docs/bootstrap-policies/apply-policy.json` to the apply role (adds the `eks-fargate.amazonaws.com` service-linked role) before the first Phase 3 apply.
2. Keep `docs/bootstrap-policies/plan-policy.json` in sync with the live plan role (it includes `budgets:ListTagsForResource`).
3. Run `terraform-apply`: read the plan in `tf-plan`, approve `tf-apply` (environment `infra`).
4. After `tf-apply`, read the add-ons plan in `addons-plan`, then approve `addons-apply` (second `infra` approval).
5. Check the cluster with `docs/runbooks/cluster-access.md`.

## Rules

- No long-lived AWS keys anywhere.
- Role ARNs, account ID and bucket name are never hardcoded; they arrive as variables.
- `terraform init` uses `-backend-config="bucket=$TF_STATE_BUCKET"`.

## Phase 4 (Helm deploy) manual steps

1. Attach `docs/bootstrap-policies/deploy-dev-policy.json` and `deploy-prod-policy.json` to the deploy roles (adds `acm:ListCertificates`).
2. Merging the chart to `main` triggers `cd.yml` (paths `app/**`, `helm/**`): build, scan, push, deploy dev, then prod, each behind its environment approval.
3. The API key secret needs a value or `/ready` stays 503 and the ALB target stays unhealthy (see `docs/runbooks/phase4-deploy-check.md`).
4. Decide how the `SecurityGroupPolicy` is created (SEC-032) before closing EXC-007.
