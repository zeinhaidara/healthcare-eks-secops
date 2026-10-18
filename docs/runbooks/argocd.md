# Runbook: Argo CD

Argo CD runs in the `argocd` namespace on Fargate. metrics-server runs in `kube-system` and External Secrets in `external-secrets`. `terraform/cluster-addons` installs all three. Argo has no AWS role. It reads this repo as a GitHub App and deploys with its own in-cluster RBAC. Deploys and rollback are in [gitops-deploy.md](gitops-deploy.md).

## Install order

1. Apply the root (`terraform/`). It adds the `argocd` and `external-secrets` Fargate profiles.
2. Apply the add-ons root (`terraform/cluster-addons`): namespaces, Helm releases, the External Secrets role, the repo credential and the `healthcare-api` ServiceAccounts.
3. Run the checks below. There is no step by hand.

Before the first add-ons plan, the live apply role needs the `SecretsGithubAppRead` statement from `docs/bootstrap-policies/apply-policy.json`. Without it the secret lookup is denied.

## Sign in to the UI

The UI is at `https://argocd.<domain>` (`DOMAIN_NAME` variable). It is internet-facing with no IP allowlist, so sign-in is the control.

1. Choose **Log in via GitHub**. The first time, GitHub asks you to authorise the OAuth App `healthcare-eks-argocd-sso`.
2. Your role comes from your GitHub username, set in `argocd_rbac` (`terraform/cluster-addons/variables.tf`). Anyone not listed signs in but sees nothing (`role:none`).
3. To check your role, open User Info. `preferred_username` must equal your GitHub username.

To add or change a person, edit `argocd_rbac` in a PR into `dev`, release to `main`, and run `terraform-apply`.

The local admin login is off (`admin.enabled: "false"`), so there is no admin password to read. Always sign in with GitHub. If GitHub sign-in breaks, the way back is a PR that sets it to `"true"`, released and applied.

## Checks

- `kubectl -n argocd get pods` and `kubectl -n external-secrets get pods`: all Running.
- `kubectl get clustersecretstore aws-secrets-manager`: Ready.
- `kubectl -n argocd get externalsecret healthcare-repo`: SecretSynced. Do not print the Secret.
- `kubectl top pods -A` returns numbers (metrics-server works).
- UI: Settings, Repositories shows the repo as Successful.

## How the repo credential works

- The GitHub App is installed on this repo only, with Contents and Metadata read-only.
- Its App ID, installation ID and private key live in one Secrets Manager secret (keys `githubAppID`, `githubAppInstallationID`, `githubAppPrivateKey`). Terraform finds it by name and never reads the value.
- External Secrets reads that one secret through its IRSA role, and builds the Secret `healthcare-repo` in `argocd`. It refreshes every hour.
- `ClusterSecretStore` and `ExternalSecret` need the operator's CRDs, so a small local chart (`charts/argocd-repo-secret`) delivers them after the operator release. One apply is enough.

## Rotate the GitHub App key

Every 90 days, or at once after a suspected leak. The App ID and installation ID do not change.

1. In GitHub, generate a **second** private key for the App. Keep the old one until step 5.
2. In Secrets Manager, replace `githubAppPrivateKey` with the new key. Keep the other two keys. Never paste the key into a terminal, chat, ticket or this repo.
3. Wait for the hourly refresh, or force a sync: `kubectl -n argocd annotate externalsecret healthcare-repo force-sync=$(date +%s) --overwrite`. Forcing needs cluster write, which no person has today; see the note below.
4. In the UI, Settings, Repositories shows Successful, and an Application refresh works.
5. Delete the old key in GitHub and the local key file.

If step 4 fails, put the old key back, force a sync, and check again.

## Rotate the GitHub sign-in client secret

The OAuth App's client ID and secret live only in the Secrets Manager secret `cloudbatch818-zein-hcsecops-argocd-github-sso` (keys `OAuth-Client-ID`, `OAuth-Client-Secret`). External Secrets copies them into `argocd-github-sso`, which Dex reads. There is no auto-rotation: GitHub has no API to issue a new client secret.

1. In GitHub, open the OAuth App and generate a new client secret.
2. In Secrets Manager, replace `OAuth-Client-Secret` only.
3. Wait for the hourly refresh, or force a sync: `kubectl -n argocd annotate externalsecret argocd-github-sso force-sync=$(date +%s) --overwrite` (needs cluster write).
4. Dex does not reload by itself: `kubectl -n argocd rollout restart deployment argocd-dex-server` (needs cluster write). Sign in to confirm.
5. Delete the old client secret in GitHub.

## Operator access

Once the break-glass removal is applied, the operator's access list shows `AmazonEKSViewPolicy` at cluster scope only.

## Who can run these commands

The operator has cluster-wide view only, which cannot read Argo CD or External Secrets objects or change anything. The apply role is assumable only from GitHub Actions. So no person has cluster write today. Steps marked "needs cluster write" require a temporary, reviewed access entry, added and removed through Terraform.

## Fargate notes

- Each component is its own Fargate pod, sized from its requests ([budget.md](../cost/budget.md) has the inventory).
- metrics-server listens on 10251 and the External Secrets webhook on 10260, because Fargate reserves 10250.
- Fargate rejects `runAsGroup` without `runAsUser`. The `securitycontext-check` job catches it; see [failed-terraform-run.md](failed-terraform-run.md).
