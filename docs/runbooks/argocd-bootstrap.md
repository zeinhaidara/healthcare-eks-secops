# Runbook: Argo CD bootstrap

Argo CD runs in the `argocd` namespace on Fargate, metrics-server in `kube-system` and External Secrets in `external-secrets`, all installed by `terraform/cluster-addons`. Argo has no AWS role. It reads this repo as a GitHub App (Contents and Metadata, read-only) and deploys with the in-cluster RBAC from its own install. Nothing here is applied by the pipeline until you approve the add-ons apply.

## Order

1. Apply the root (`terraform/`): adds the `argocd` and `external-secrets` Fargate profiles.
2. Apply the add-ons root (`terraform/cluster-addons`): namespaces, the Helm releases, the External Secrets role, the repo credential and the `healthcare-api` ServiceAccounts.
3. Check the repo credential (below). There is no by-hand step.
4. Deploys then run through Argo CD: see `docs/runbooks/gitops-deploy.md`. Nothing here runs `helm upgrade`; CI never deploys.

## The repo credential (GitHub App, synced by External Secrets)

The App was created and installed on this repo only, by hand. Its App ID, installation ID and private key exist only in one Secrets Manager secret (JSON keys `githubAppID`, `githubAppInstallationID`, `githubAppPrivateKey`). Terraform finds the secret by name (`github_app_secret_name`) and never reads its value.

- External Secrets Operator (`external-secrets` namespace) assumes a role that can read that one secret (`secretsmanager:GetSecretValue` and `DescribeSecret`).
- A `ClusterSecretStore` points at Secrets Manager in the cluster's region, using the operator's service account (no static keys).
- An `ExternalSecret` in `argocd` builds the Secret `healthcare-repo` with the label `argocd.argoproj.io/secret-type: repository`, the repo URL and the three App fields. It refreshes every hour.
- **CRD ordering:** `ClusterSecretStore` and `ExternalSecret` exist only after the operator's CRDs are installed. Terraform's `kubernetes_manifest` needs the CRD at plan time, so the two objects are delivered by a small local Helm chart (`terraform/cluster-addons/charts/argocd-repo-secret`) in a release that depends on the operator release. Helm needs the CRD only at install, so one apply works. No second step is needed.
- Before the first add-ons plan, the live apply role needs the `SecretsGithubAppRead` statement from `docs/bootstrap-policies/apply-policy.json` (applied by hand, see `docs/bootstrap-policies/README.md`). Without it the secret lookup is denied.
- To rotate the App key, see `docs/runbooks/argocd-github-app-rotation.md`.

## Checks

- `kubectl -n argocd get pods` and `kubectl -n external-secrets get pods`: all Running.
- `kubectl get clustersecretstore aws-secrets-manager`: status Ready.
- `kubectl -n argocd get externalsecret healthcare-repo`: status SecretSynced, and `kubectl -n argocd get secret healthcare-repo` exists. Do not print its data.
- `kubectl top pods -A` returns numbers (metrics-server works).
- UI: `https://argocd.<domain>` (see `docs/runbooks/gitops-deploy.md`). Settings, Repositories shows the repo as Successful.

## Fargate notes

- Each Argo and External Secrets component is one Fargate pod sized from its requests, so the stack costs more while it runs. The session destroy removes it.
- metrics-server listens on port 10251 and the External Secrets webhook on 10260, because Fargate reserves 10250.
