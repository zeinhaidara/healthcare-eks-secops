# Runbook: Phase 4 deploy check

Run after `cd.yml` deploys a namespace. `$NS` is `cloudbatch818-healthcare-dev` or `-prod`. Region us-east-2.

## 1. Release and pods

```sh
helm status healthcare-api -n "$NS"
kubectl get deploy,pods,svc,ingress,pdb -n "$NS"
kubectl get pods -n "$NS" -o wide        # NODE names start with fargate-ip-
```

The pods must be `Running` and `READY 1/1`. A `Pending` pod means no Fargate profile matched (check the namespace and labels).

## 2. What `/ready` returning 503 means

`/ready` is 200 only after the app has loaded the API key from Secrets Manager. 503 means one of:
- **The secret has no value yet.** Set it (docs/bootstrap.md). Rotation is a separate path (docs/runbooks/rotation.md).
- **The pod cannot reach Secrets Manager or KMS:** check the logs for `api key fetch failed` and the error type (`NoCredentialsError` means the IRSA annotation or the role trust is wrong; `ClientError` means the policy).
- **The service account is not the IRSA one:** it must be `healthcare-api` (the role trusts `<namespace>:healthcare-api`).

```sh
kubectl logs -n "$NS" deploy/healthcare-api | tail -20
kubectl get sa healthcare-api -n "$NS" -o jsonpath='{.metadata.annotations.eks\.amazonaws\.com/role-arn}'
```

A 503 pod is not ready, so Kubernetes and the ALB keep it out of service. This is by design, not an outage of the ALB.

## 3. The ALB and its target group

```sh
kubectl get ingress healthcare-api -n "$NS"     # ADDRESS is the ALB DNS name
aws elbv2 describe-load-balancers --query 'LoadBalancers[?contains(DNSName, `<ADDRESS>`)].[LoadBalancerArn,State.Code]'
aws elbv2 describe-target-groups --load-balancer-arn <arn> --query 'TargetGroups[].[TargetGroupArn,TargetType,HealthCheckPath]'
aws elbv2 describe-target-health --target-group-arn <tg-arn>
```

Expect: `TargetType` `ip`, `HealthCheckPath` `/health`, listeners on 80 (redirect) and 443 (certificate attached), and targets `healthy`. `unhealthy` with reason `Target.Timeout` usually points to the pod security group or the cluster security group not allowing the ALB; `Target.ResponseCodeMismatch` means `/health` is not 200.

If the ingress has no ADDRESS after a few minutes: check the controller (`kubectl logs -n kube-system deploy/aws-load-balancer-controller`), that the certificate exists for `*.<domain>`, and that the public subnets carry the `kubernetes.io/role/elb` tag.

## 4. HTTPS end to end

```sh
curl --connect-to "<host>:443:<ALB DNS>:443" -s -o /dev/null -w '%{http_code}\n' https://<host>/health
curl -s -o /dev/null -w '%{http_code}\n' http://<ALB DNS>/ -H "Host: <host>"    # 301 to https
```

`scripts/smoke-test.sh` does the first check for both `/health` and `/ready`.

## 5. Security group for pods (EXC-007)

Only when `securityGroupPolicy.enabled` is true (SEC-032): the pod's network interface must carry the pod security group, and the pods must still serve traffic.

```sh
kubectl get securitygrouppolicy -n "$NS"
aws ec2 describe-network-interfaces --filters Name=description,Values='aws-k8s-branch-eni' \
  --query 'NetworkInterfaces[].Groups[].GroupName'
```

EXC-007 closes only after this shows the group on the pods and the smoke test passes.

## 6. Roll back

```sh
helm history healthcare-api -n "$NS"
helm rollback healthcare-api <revision> -n "$NS" --wait
```
