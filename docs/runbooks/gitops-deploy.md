# Runbook: GitOps deploy (Argo CD)

CI builds, scans and pushes the image. It never runs `helm` or `kubectl` against the cluster. Argo CD deploys from Git. Rollback is a `git revert` of the image tag.

## The flow

1. A pull request that changes `app/` is merged to `dev`.
2. The merge to `dev` runs `cd.yml`: build, Trivy scan (blocks on HIGH or CRITICAL), push to ECR by commit SHA, then read the pushed digest. `cd.yml` also runs by hand (Actions tab, Run workflow on `dev`): use it for the first build, or to bump to the current `dev` again.
3. The `bump-image` job sets `image.tag` (the commit SHA) and `image.digest` in `helm/healthcare-api/values-dev.yaml` and `values-prod.yaml` and commits them straight to `dev`. A merge to `dev` builds and bumps dev.
4. **dev:** the Argo CD Application `healthcare-api-dev` tracks the `dev` branch and syncs automatically (prune and self-heal on). When the bump commit lands on `dev`, dev deploys.
5. **prod:** the Application `healthcare-api-prod` tracks `main` and has no automated sync. A release from `dev` to `main` promotes the same digest to prod. Then prod shows OutOfSync until someone approves: in the Argo CD UI, open `healthcare-api-prod`, review the diff, and choose Sync. Prod syncs by hand in Argo CD. The release to `main` is a separate, owner-driven step and does not build again.

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

## Check a deploy

`$NS` is `cloudbatch818-healthcare-dev` or `-prod`, and `$ENV` is `dev` or `prod`. Region us-east-2.

### 1. Application and pods

In the Argo CD UI (port-forward, see above), open `healthcare-api-$ENV`: it should be Synced and Healthy, at the commit you expect. With an identity that can read Argo CD objects: `kubectl -n argocd get application healthcare-api-$ENV`. The read-only operator user cannot read them.

```sh
kubectl get deploy,pods,svc,ingress,pdb -n "$NS"
kubectl get pods -n "$NS" -o wide        # NODE names start with fargate-ip-
```

The pods must be `Running` and `READY 1/1`. A `Pending` pod means no Fargate profile matched (check the namespace and labels).

### 2. What `/ready` returning 503 means

`/ready` is 200 only after the app has loaded the API key from Secrets Manager. 503 means one of:
- **The secret has no value yet.** Set it (docs/bootstrap.md). Rotation is a separate path (docs/runbooks/rotation.md).
- **The pod cannot reach Secrets Manager or KMS:** check the logs for `api key fetch failed` and the error type (`NoCredentialsError` means the IRSA annotation or the role trust is wrong; `ClientError` means the policy).
- **The service account is not the IRSA one:** it must be `healthcare-api` (the role trusts `<namespace>:healthcare-api`). Terraform owns it (`terraform/cluster-addons`).

```sh
kubectl logs -n "$NS" deploy/healthcare-api | tail -20
kubectl get sa healthcare-api -n "$NS" -o jsonpath='{.metadata.annotations.eks\.amazonaws\.com/role-arn}'
```

A 503 pod is not ready, so Kubernetes and the ALB keep it out of service. This is by design, not an outage of the ALB.

### 3. The ALB and its target group

```sh
kubectl get ingress healthcare-api -n "$NS"     # ADDRESS is the ALB DNS name
aws elbv2 describe-load-balancers --query 'LoadBalancers[?contains(DNSName, `<ADDRESS>`)].[LoadBalancerArn,State.Code]'
aws elbv2 describe-target-groups --load-balancer-arn <arn> --query 'TargetGroups[].[TargetGroupArn,TargetType,HealthCheckPath]'
aws elbv2 describe-target-health --target-group-arn <tg-arn>
```

Expect: `TargetType` `ip`, `HealthCheckPath` `/health`, listeners on 80 (redirect) and 443 (certificate attached), and targets `healthy`. `unhealthy` with reason `Target.Timeout` usually points to the pod security group or the cluster security group not allowing the ALB; `Target.ResponseCodeMismatch` means `/health` is not 200.

If the ingress has no ADDRESS after a few minutes: check the controller (`kubectl logs -n kube-system deploy/aws-load-balancer-controller`), that the certificate exists for `*.<domain>`, and that the public subnets carry the `kubernetes.io/role/elb` tag.

### 4. HTTPS end to end

```sh
curl --connect-to "<host>:443:<ALB DNS>:443" -s -o /dev/null -w '%{http_code}\n' https://<host>/health
curl -s -o /dev/null -w '%{http_code}\n' http://<ALB DNS>/ -H "Host: <host>"    # 301 to https
```

[`scripts/smoke-test.sh`](../../scripts/smoke-test.sh) does the first check for both `/health` and `/ready`: `scripts/smoke-test.sh "$NS" "$ENV.<domain>"`.

### 5. Security group for pods

The `SecurityGroupPolicy` is created by `terraform/cluster-addons` (apply role, `addons-apply`), not by the chart (SEC-032). Pods created before the policy existed do not have the group. Restart them through Git, not by hand: Argo CD self-heal on dev reverts manual changes, so a restart means a new sync. The pod's network interface must carry the pod security group, and the pods must still serve traffic.

```sh
kubectl get securitygrouppolicy -n "$NS"
aws ec2 describe-network-interfaces --filters Name=description,Values='aws-k8s-branch-eni' \
  --query 'NetworkInterfaces[].Groups[].GroupName'
```

### 6. Roll back

Do not use `helm rollback`: Argo CD owns the release and would sync it back. Revert the image bump in Git (see [Roll back](#roll-back)). For prod, approve the sync in Argo CD after the revert reaches `main`.

## Not covered

- API key rotation no longer rolls the pods by itself. The deploy job used to set a Secrets Manager version annotation. After a rotation, restart the pods (`docs/runbooks/rotation.md`) until an automatic method is chosen.
- CI does not wait for Argo to report Synced and Healthy. That needs an Argo CD API token and a reachable Argo, which means a new secret and exposure, so it is not built.
