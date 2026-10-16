# Runbook: GitOps deploy (Argo CD)

CI builds, scans and pushes the image. It never runs `helm` or `kubectl` against the cluster. Argo CD deploys from Git. Rollback is a `git revert` of the image tag.

## The flow

1. **Merge a change to `dev`.** A pull request that changes `app/` is merged into `dev`.
2. **`cd` builds once.** The push to `dev` runs `cd.yml`: build, Trivy scan (blocks on HIGH or CRITICAL), push to ECR by commit SHA, then read the pushed digest. It also runs by hand (Actions tab, Run workflow on `dev`).
3. **`cd` bumps both values files on `dev`.** The `bump-image` job sets `image.tag` (the commit SHA) and `image.digest` in `helm/healthcare-api/values-dev.yaml` and `values-prod.yaml` and commits them straight to `dev`. That commit changes only values, so it does not start another build.
4. **Argo syncs dev automatically.** The Application `healthcare-api-dev` tracks the `dev` branch (prune and self-heal on), so dev deploys when the bump commit lands.
5. **Open a pull request from `dev` to `main`, and merge it** (merge commit, not squash). This is the release, and it is an owner step.
6. **Argo prod shows OutOfSync.** The Application `healthcare-api-prod` tracks `main` and has no automated sync, so it only reports the difference.
7. **Click Sync in the Argo UI** (steps below). Prod now runs the same digest dev ran.

Prod stays on the old digest until `main` carries the bump commit: the prod values file on `main` only changes when step 5 merges. The release does not build again.

The image repository, the ACM certificate, the VPC CIDR, the project tag and the API key secret name are not in Git. Terraform (`terraform/cluster-addons`) looks them up and gives them to the Applications as Helm parameters. The ServiceAccount and its IRSA role annotation are owned by Terraform; the chart only refers to it by name (`serviceAccount.create: false`).

## Open the Argo CD UI

1. Point `kubectl` at the cluster with an identity that may read secrets in the `argocd` namespace: `aws eks update-kubeconfig --name <cluster name> --region us-east-2`.
2. Forward the server: `kubectl -n argocd port-forward svc/argocd-server 8443:443`
3. Open `https://localhost:8443`. The certificate is self-signed, so the browser warns once.
4. Sign in as `admin`. The password comes from the Kubernetes Secret `argocd-initial-admin-secret` in the `argocd` namespace, key `password` (the Argo CD chart default; no SSO is set up). Read it on your own machine, for example `kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}'` and base64-decode the output. Do not paste it into a ticket, chat or file.
5. Open `healthcare-api-prod`, review the diff, and choose Sync.

The read-only operator access cannot read secrets, so it cannot fetch that password. If the initial secret has been deleted after a password change, use the password that replaced it.

## Roll back

Roll back with a revert, not a cluster command.

- dev: revert the merged bump pull request on `dev` (a revert pull request into `dev`). Argo syncs the previous tag.
- prod: revert the bump on `main` through the normal `dev` to `main` release, then approve the sync in Argo CD.
- A bad image tag also stops dev: Argo shows the Application Degraded, and the previous ReplicaSet keeps serving until the new pods are ready.

## Force a sync or check state

- UI: see [Open the Argo CD UI](#open-the-argo-cd-ui), then open the Application and choose Refresh or Sync.
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
