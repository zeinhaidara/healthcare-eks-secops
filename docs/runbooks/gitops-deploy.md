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

The UI is at `https://argocd.<domain>` (the domain is the `DOMAIN_NAME` variable). It is an internet-facing load balancer with a valid certificate and no IP allowlist, so sign-in is the control.

1. Open the URL and choose **Log in via GitHub**. GitHub asks you to authorise the OAuth App `healthcare-eks-argocd-sso` the first time.
2. You come back signed in. Your role comes from your GitHub username (`terraform/cluster-addons/variables.tf`, variable `argocd_rbac`): `zeinhaidara` is `role:admin`, `pxkundu` and `oguduf` are `role:readonly`. Anyone else can sign in but sees nothing (`policy.default` is `role:none`).
3. Open `healthcare-api-prod`, review the diff, and choose Sync (admin only).

To check the role you got, open User Info in the UI (or `/api/v1/session/userinfo`): the `preferred_username` claim must equal your GitHub username, which is what the RBAC lines match on.

To add or change a person, edit `argocd_rbac` in `terraform/cluster-addons/variables.tf` through a pull request into `dev`, release to `main`, and run `terraform-apply`.

**Local admin (fallback, until SSO is verified).** The `admin` login is still on. Its password is the Kubernetes Secret `argocd-initial-admin-secret` in the `argocd` namespace, key `password`; read it on your own machine and do not paste it anywhere. If the endpoint is not up yet, `kubectl -n argocd port-forward svc/argocd-server 8443:443` and `https://localhost:8443` still work. The clean-up at the end of this page turns the local admin off.

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

In the Argo CD UI (see Open the Argo CD UI), open `healthcare-api-$ENV`: it should be Synced and Healthy, at the commit you expect. With an identity that can read Argo CD objects: `kubectl -n argocd get application healthcare-api-$ENV`. The read-only operator user cannot read them.

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

## Rotate the GitHub sign-in client secret

The OAuth App `healthcare-eks-argocd-sso` has a client ID and a client secret. They live only in the Secrets Manager secret `cloudbatch818-zein-hcsecops-argocd-github-sso`, keys `OAuth-Client-ID` and `OAuth-Client-Secret`. External Secrets copies them into the Kubernetes Secret `argocd-github-sso`, which Dex reads. Nothing is in Git.

Auto-rotation is off on purpose: GitHub has no API a Secrets Manager rotation function could call to issue a new client secret, so there is nothing for it to rotate. Rotate by hand:

1. In GitHub, open the OAuth App, choose **Generate a new client secret**, and copy it. Do not paste it anywhere except the next step.
2. In Secrets Manager, edit the secret `cloudbatch818-zein-hcsecops-argocd-github-sso` and replace the value of `OAuth-Client-Secret` (leave `OAuth-Client-ID` as it is).
3. Wait for External Secrets to refresh (it checks every hour), or force it now: `kubectl -n argocd annotate externalsecret argocd-github-sso force-sync=$(date +%s) --overwrite`. Check it: `kubectl -n argocd get externalsecret argocd-github-sso` shows `SecretSynced`. Do not print the Secret.
4. Dex picks up the changed Secret and restarts. Sign in with GitHub to confirm.
5. Back in GitHub, delete the old client secret.

## Later clean-up (not yet done)

Do this by hand only after you have signed in with GitHub and seen the right role (see Open the Argo CD UI). It has **not** been done.

1. **Turn the local admin login off.** In `terraform/cluster-addons/main.tf` (`helm_release.argocd`), set `"admin.enabled"` to `"false"`. Open a pull request into `dev`, release to `main`, and run `terraform-apply`. Check that the login page shows only the GitHub button.
2. **Remove the manual admin association on the `argocd` namespace.** It was added by hand and is not in Terraform, so Terraform will not remove it. Run this as the owner (the cluster name and principal are yours, not in Git):

   ```sh
   aws eks disassociate-access-policy \
     --cluster-name <cluster name> \
     --principal-arn <the operator IAM user ARN> \
     --policy-arn arn:aws:eks::aws:cluster-access-policy/AmazonEKSAdminPolicy \
     --region us-east-2
   aws eks list-associated-access-policies --cluster-name <cluster name> \
     --principal-arn <the operator IAM user ARN> --region us-east-2
   ```

   The list must no longer show `AmazonEKSAdminPolicy` for the `argocd` namespace.
3. The Terraform-managed read-only association (`operator_argocd_read`, see `docs/runbooks/eks-operator-import.md`) is a separate thing and stays until you remove its resource through a pull request.
