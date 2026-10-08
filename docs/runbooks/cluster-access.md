# Runbook: cluster access checks

Run with the apply role (cluster admin, EXC-006) unless a step says otherwise. Region us-east-2.

## 1. Cluster is ACTIVE

```sh
aws eks describe-cluster --name "$CLUSTER_NAME" --query 'cluster.{status:status,version:version,public:resourcesVpcConfig.endpointPublicAccess,private:resourcesVpcConfig.endpointPrivateAccess,auth:accessConfig.authenticationMode}'
aws eks update-kubeconfig --name "$CLUSTER_NAME" --region us-east-2
```

Expect `status: ACTIVE`, both endpoints true, `auth: API`.

## 2. Fargate only, CoreDNS running

```sh
aws eks list-fargate-profiles --cluster-name "$CLUSTER_NAME"
kubectl get nodes                       # only fargate-ip-... nodes, one per running pod
kubectl get daemonsets -n kube-system   # expect none (no aws-node, no kube-proxy)
kubectl get pods -n kube-system -l k8s-app=kube-dns -o wide   # Running, NODE is fargate-...
aws eks describe-addon --cluster-name "$CLUSTER_NAME" --addon-name coredns --query 'addon.{status:status,version:addonVersion,config:configurationValues}'
```

## 3. Load Balancer Controller running

```sh
kubectl get deployment -n kube-system aws-load-balancer-controller   # READY 2/2
kubectl get sa -n kube-system aws-load-balancer-controller -o jsonpath='{.metadata.annotations.eks\.amazonaws\.com/role-arn}'
kubectl logs -n kube-system deployment/aws-load-balancer-controller | grep -i error   # expect nothing
```

## 4. Namespaces enforce Pod Security restricted

```sh
kubectl get ns cloudbatch818-healthcare-dev cloudbatch818-healthcare-prod --show-labels
```

## 5. Each deploy role sees only its own namespace

Assume the deploy-dev role (for example in a manual run of the deploy job, or with `aws sts assume-role` if your trust policy allows it), then:

```sh
kubectl auth can-i create deployments -n cloudbatch818-healthcare-dev    # yes
kubectl auth can-i create deployments -n cloudbatch818-healthcare-prod   # no
kubectl auth can-i list secrets -n kube-system                           # no
kubectl auth can-i create namespaces                                     # no
aws eks list-associated-access-policies --cluster-name "$CLUSTER_NAME" \
  --principal-arn <deploy-dev role ARN>                                  # AmazonEKSEditPolicy, namespace scope
```

Repeat for deploy-prod with the namespaces swapped.
