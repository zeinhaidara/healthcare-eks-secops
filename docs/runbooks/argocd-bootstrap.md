# Runbook: Argo CD bootstrap

Argo CD runs in the `argocd` namespace on Fargate and metrics-server in `kube-system`, both installed by `terraform/cluster-addons`. Argo has no AWS role. It reads this repo with a read-only deploy key and deploys with the in-cluster RBAC from its own install. Nothing here is applied by the pipeline until you approve the add-ons apply.

## Order

1. Apply the root (`terraform/`): adds the `argocd` Fargate profile.
2. Apply the add-ons root (`terraform/cluster-addons`): namespace `argocd`, the two Helm releases and the `healthcare-api` ServiceAccounts.
3. Create the repo credential (below).

## The repo deploy key (by hand, never committed)

The key and the Secret manifest are never committed or created by Terraform.

1. Generate a key pair on your machine with `ssh-keygen -t ed25519 -N "" -f <path>`.
2. In GitHub, add the public half as a deploy key on this repo, read-only. Do not tick "allow write access".
3. Create the Secret from the private key file, then label it so Argo picks it up:

```sh
kubectl -n argocd create secret generic healthcare-repo \
  --from-literal=type=git \
  --from-literal=url=git@github.com:zeinhaidara/healthcare-eks-secops.git \
  --from-file=sshPrivateKey=<path>
kubectl -n argocd label secret healthcare-repo argocd.argoproj.io/secret-type=repository
```

4. Delete the local key file once the Secret exists.

## Checks

- `kubectl -n argocd get pods`: all Running.
- `kubectl top pods -A` returns numbers (metrics-server works).
- UI, only when needed: `kubectl -n argocd port-forward svc/argocd-server 8443:443`.

## Existing ServiceAccounts

If the chart already created a `healthcare-api` ServiceAccount in an app namespace (Helm owns it), the add-ons apply fails with "already exists" for that namespace. Import it into state before applying, for example `terraform import 'kubernetes_service_account_v1.app["dev"]' <namespace>/healthcare-api`, then plan again. The chart stops creating it in the next change.

## Import workflow

The workflow `terraform-import-addons` (`.github/workflows/terraform-import-addons.yml`) imports the two `healthcare-api` ServiceAccounts into the add-ons state. It is one-time and safe to re-run: an address already in state is skipped. It changes state only and never creates, changes or destroys anything in the cluster.

1. Open the Actions tab, choose `terraform-import-addons`, and run it on the `main` branch. The `infra` environment accepts only `main` and waits for reviewer approval.
2. Open the run summary. Success looks like a plan summary of `Plan: 3 to add, 0 to change, 0 to destroy` and `ServiceAccount creates in the plan: 0`.
3. Run the normal Terraform pipeline for the add-ons apply after reviewing that plan.
4. Remove the workflow once the import is confirmed.

## Fargate notes

- Each Argo component is one Fargate pod sized from its requests, so the stack costs more while it runs. The session destroy removes it.
- metrics-server listens on port 10251 because Fargate reserves 10250.
