# Runbook: GitOps deploy (Argo CD)

CI builds, scans and pushes the image. It never runs `helm` or `kubectl` against the cluster. Argo CD deploys from Git. Rollback is a `git revert` of the image tag.

## The flow

1. A pull request that changes `app/` is merged to `dev`, then released to `main` (a pull request from `dev`, merge commit).
2. The push to `main` runs `cd.yml`: build, Trivy scan (blocks on HIGH or CRITICAL), push to ECR by commit SHA, then read the pushed digest. `cd.yml` also runs by hand (Actions tab, Run workflow on `main`): use it for the first build, or to bump to the current `main` again.
3. The `bump-image` job opens a pull request **to `dev`** that sets `image.tag` (the commit SHA) and `image.digest` in `helm/healthcare-api/values-dev.yaml` and `values-prod.yaml`, and turns on auto-merge. Auto-merge waits for the required checks.
4. **dev:** the Argo CD Application `healthcare-api-dev` tracks the `dev` branch and syncs automatically (prune and self-heal on). When the bump merges to `dev`, dev deploys.
5. **prod:** the Application `healthcare-api-prod` tracks `main` and has no automated sync. The bump reaches `main` only when you release `dev` to `main`. Then prod shows OutOfSync until someone approves: in the Argo CD UI, open `healthcare-api-prod`, review the diff, and choose Sync. The release to `main` is a separate, owner-driven step. `cd.yml` does not run for a values-only change, so a release that only carries a bump does not build again.

The image repository, the ACM certificate, the VPC CIDR, the project tag and the API key secret name are not in Git. Terraform (`terraform/cluster-addons`) looks them up and gives them to the Applications as Helm parameters. The ServiceAccount and its IRSA role annotation are owned by Terraform; the chart only refers to it by name (`serviceAccount.create: false`).

## Settings the owner must turn on once

- Repository setting "Allow GitHub Actions to create and approve pull requests". `bump-image` uses the workflow token and cannot open its pull request without it.
- Repository setting "Allow auto-merge".
- A pull request opened with the workflow token does not start other workflows, so checks do not run on the bump pull request. The `dev` ruleset requires a pull request and no status checks, so it can merge. If `dev` gains required checks, use a GitHub App token for `bump-image`.

## Roll back

Roll back with a revert, not a cluster command.

- dev: revert the merged bump pull request on `dev` (a revert pull request into `dev`). Argo syncs the previous tag.
- prod: revert the bump on `main` through the normal `dev` to `main` release, then approve the sync in Argo CD.
- A bad image tag also stops dev: Argo shows the Application Degraded, and the previous ReplicaSet keeps serving until the new pods are ready.

## Force a sync or check state

- UI: `kubectl -n argocd port-forward svc/argocd-server 8443:443`, then open the Application and choose Refresh or Sync.
- Read-only state: `kubectl -n argocd get applications` shows sync and health.
- Before the first bump the image tag is empty, so Argo reports a comparison error ("image.tag is required"). Run `cd.yml` by hand to produce the first bump.

## Not covered

- API key rotation no longer rolls the pods by itself. The deploy job used to set a Secrets Manager version annotation. After a rotation, restart the pods (`docs/runbooks/rotation.md`) until an automatic method is chosen.
- CI does not wait for Argo to report Synced and Healthy. That needs an Argo CD API token and a reachable Argo, which means a new secret and exposure, so it is not built.
