# Runbook: GitOps deploy

CI builds, scans and pushes the image. It never runs `helm` or `kubectl` against the cluster. Argo CD deploys from Git. Rollback is a `git revert`. Argo CD setup and sign-in are in [argocd.md](argocd.md).

## The flow

1. A PR that changes `app/` is merged into `dev`.
2. `cd.yml` builds, scans with Trivy (blocks on fixable HIGH or CRITICAL), pushes to ECR by commit SHA and reads the digest. It also runs by hand on `dev`.
3. `bump-image` sets `image.tag` and `image.digest` in `values-dev.yaml` and `values-prod.yaml` and commits to `dev`. That commit does not start another build.
4. `healthcare-api-dev` tracks `dev` with automatic sync, prune and self-heal, so dev deploys.
5. The owner merges a PR from `dev` into `main` (merge commit). This is the release. Nothing is rebuilt.
6. `healthcare-api-prod` tracks `main` with no automatic sync, so it shows OutOfSync.
7. An admin reviews the diff in the Argo CD UI and chooses Sync. Prod now runs the digest dev ran.

The image repository, certificate, VPC CIDR, project tag and secret name are not in Git. Terraform passes them to the Applications as Helm parameters. Terraform also owns the ServiceAccount and its IRSA annotation (`serviceAccount.create: false`).

## Roll back

Do not use `helm rollback`: Argo CD owns the release and would sync it back.

- dev: a revert PR of the bump commit into `dev`. Argo syncs the previous tag.
- prod: release the revert to `main`, then Sync in Argo CD.
- A bad image leaves the Application Degraded. The old ReplicaSet keeps serving until new pods are ready.

## Check a deploy

`$NS` is `cloudbatch818-healthcare-dev` or `-prod`. `$ENV` is `dev` or `prod`.

**Application.** In the UI, `healthcare-api-$ENV` is Synced and Healthy at the expected commit. With an identity that can read Argo objects: `kubectl -n argocd get applications`. Before the first bump, the tag is empty and Argo reports "image.tag is required". Run `cd.yml` by hand.

**Pods.**

```sh
kubectl get deploy,pods,svc,ingress,pdb -n "$NS"
kubectl get pods -n "$NS" -o wide        # NODE names start with fargate-ip-
```

Pods must be Running and 1/1. `Pending` means no Fargate profile matched.

**`/ready` returns 503.** It is 200 only after the app loads the API key. A 503 pod stays out of the ALB by design. Causes:

- The secret has no value yet. Set it ([bootstrap.md](../bootstrap.md)).
- The pod cannot reach Secrets Manager or KMS. Logs show `api key fetch failed`: `NoCredentialsError` means the IRSA annotation or trust is wrong, `ClientError` means the policy.
- The service account is not `healthcare-api`.

```sh
kubectl logs -n "$NS" deploy/healthcare-api | tail -20
kubectl get sa healthcare-api -n "$NS" -o jsonpath='{.metadata.annotations.eks\.amazonaws\.com/role-arn}'
```

**ALB and target group.**

```sh
kubectl get ingress healthcare-api -n "$NS"     # ADDRESS is the ALB DNS name
aws elbv2 describe-target-health --target-group-arn <tg-arn>
```

Expect target type `ip`, health check `/health`, 80 redirecting to 443, and healthy targets. `Target.Timeout` usually means a security group blocks the ALB. `Target.ResponseCodeMismatch` means `/health` is not 200. No ADDRESS after a few minutes: check the controller logs (`kubectl logs -n kube-system deploy/aws-load-balancer-controller`), the `*.<domain>` certificate, and the `kubernetes.io/role/elb` subnet tag.

**HTTPS end to end.** `scripts/smoke-test.sh "$NS" "$ENV.<domain>"` checks `/health` and `/ready`.

**Pod security group.** `terraform/cluster-addons` creates the `SecurityGroupPolicy`, not the chart. Pods created before it lack the group. Restart them through a sync, not by hand.

```sh
kubectl get securitygrouppolicy -n "$NS"
```

## Not covered

- API key rotation does not roll the pods. Restart them after a rotation ([rotation.md](rotation.md)).
- CI does not wait for Argo to report Healthy. That needs an Argo API token, so it is not built.
