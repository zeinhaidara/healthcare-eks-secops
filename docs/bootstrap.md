# Bootstrap

One-time setup done by hand, outside Terraform. Terraform and the workflows only reference these through variables. Role ARNs, the account ID and the bucket name are never hardcoded.

## AWS, created by hand

- S3 state bucket (repo variable `TF_STATE_BUCKET`), versioned and encrypted. Terraform uses native locking (`use_lockfile`), so there is no lock table. `terraform init` gets it through `-backend-config`.
- The GitHub OIDC identity provider. No long-lived AWS keys anywhere.
- One IAM role per purpose, each trusting only this repo through OIDC. Policies are in [bootstrap-policies/](bootstrap-policies/README.md) and applied by hand.

| Role | Used by | Access |
|---|---|---|
| plan | `tf-plan` | Read-only; state lock file only |
| apply | `tf-apply`, add-ons jobs (`infra`), `terraform-destroy.yml` (`infra-destroy`) | Write, scoped to project resources; EKS cluster admin (EXC-006) |
| ecr-push | `cd.yml` job `push` | Push to the project ECR repo; trusts `main` and `dev` only |
| deploy-dev, deploy-prod | Nothing: unused since 2026-10-15; EKS access removed in this PR | None. The roles stay until deleted by hand |

## GitHub, set by hand

- Environments `infra`, `infra-destroy`, `dev` and `prod`. Each has one required reviewer (the maintainer), self-review allowed, admin bypass on. `infra`, `infra-destroy` and `prod` deploy from `main` only; `dev` from protected branches. `infra` and `infra-destroy` hold `AWS_ROLE_ARN` (the apply role).
- `main` ruleset: PR required with 0 approvals (EXC-003), no force push, no deletion, merge commits only, a `code_scanning` rule for CodeQL, and 10 required checks: `app-build`, `app-checkov`, `app-image-scan`, `app-test-lint`, `app-trivy`, `tf-checkov`, `tf-validate`, `sonar`, `codeql`, `CodeQL`.
- `dev` ruleset: PR required with 0 approvals, no force push, no deletion, no required checks.
- SonarCloud: secret `SONAR_TOKEN`, variables `SONAR_PROJECT_KEY` and `SONAR_ORGANIZATION`. Without them `sonar` fails on purpose. The free plan enforces the gate on PRs only.
- CodeQL needs no secret; the repo is public.
- Repo and environment variables for Terraform (`TF_VAR_*` values) and the workflows.

## After the first apply

Terraform creates the API key secret empty, so the key never enters state. Set it:

1. Generate a value (password manager or `openssl rand -base64 32`).
2. In the console (us-east-2), open the secret, Retrieve secret value, Edit, Plaintext tab, paste and save.
3. Keep a copy for testing `/patients`.

Until it is set, pods stay not-ready (`/ready` returns 503). The destroy deletes the secret at once (recovery window 0), so set it again after every apply. Rotation is in [rotation.md](runbooks/rotation.md).

Then check the cluster with [cluster-access.md](runbooks/cluster-access.md) and Argo CD with [argocd.md](runbooks/argocd.md).
