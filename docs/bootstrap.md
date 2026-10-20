# Bootstrap

The stack was torn down on 2026-10-20. Most of what is set up by hand here still exists; [teardown.md](runbooks/teardown.md) lists what remains.

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
| deploy-dev, deploy-prod | Nothing: unused since 2026-10-15; EKS access removed 2026-10-18 (#151, applied) | None. The roles stay until deleted by hand |

## GitHub, set by hand

- Environments `infra` and `infra-destroy`: one required reviewer (the maintainer), self-review allowed, admin bypass on, `main` only. Both hold `AWS_ROLE_ARN` (the apply role).
- Environments `dev` and `prod` still exist but no job uses them since 2026-10-15. They hold only `ENVIRONMENT` and `K8S_NAMESPACE`; their `AWS_ROLE_ARN` variables were gone when checked on 2026-10-20.
- `main` ruleset: PR required with 0 approvals (EXC-003), no force push, no deletion, merge commits only, a `code_scanning` rule for CodeQL, and 10 required checks: `app-build`, `app-checkov`, `app-image-scan`, `app-test-lint`, `app-trivy`, `tf-checkov`, `tf-validate`, `sonar`, `codeql`, `CodeQL`.
- `dev` ruleset: no force push and no deletion only. No PR or checks are required, so `cd.yml` can push the image bump straight to `dev`.
- SonarCloud: secret `SONAR_TOKEN`, variables `SONAR_PROJECT_KEY` and `SONAR_ORGANIZATION`. Without them `sonar` fails on purpose. The free plan enforces the gate on PRs only.
- CodeQL needs no secret; the repo is public.
- Repo and environment variables for Terraform (`TF_VAR_*` values) and the workflows.

## After the first apply

Terraform creates the API key secret empty, so the key never enters state. Set it:

1. Generate a value (password manager or `openssl rand -base64 32`).
2. In the console (us-east-2), open the secret, Retrieve secret value, Edit, Plaintext tab, paste and save.
3. Keep a copy for testing `/patients`.

Until it is set, pods stay not-ready (`/ready` returns 503). A destroy deletes the secret at once (recovery window 0), so set it again after any rebuild. Rotation is in [rotation.md](runbooks/rotation.md).

Then check the cluster with [cluster-access.md](runbooks/cluster-access.md) and Argo CD with [argocd.md](runbooks/argocd.md).

## Manual steps around a rebuild

Terraform does not do these. Do them in order around `terraform-apply`:

1. Before the add-ons apply: the GitHub App key secret and the Argo CD SSO secret exist in Secrets Manager ([argocd.md](runbooks/argocd.md)).
2. After the apply: set the API key value (above).
3. After the ALBs exist: point the `dev` and `prod` DNS alias records at each environment's own ALB. Check each hostname reaches the right ALB (SEC-033).
