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

## 5. Argo CD can deploy only to the app namespaces

The Argo CD `AppProject` `healthcare` (`terraform/cluster-addons/charts/argocd-apps/templates/appproject.yaml`) allows one source repository, two destinations (the dev and prod app namespaces in this cluster), no cluster-scoped objects, and only the object kinds the chart creates. An Application that points anywhere else is refused by Argo CD with "application destination ... is not permitted in project". Check it in the Argo CD UI (Settings, Projects, `healthcare`), or with an identity that can read Argo CD objects:

```sh
kubectl -n argocd get appproject healthcare -o jsonpath='{.spec.destinations}'   # only the two app namespaces
kubectl -n argocd get appproject healthcare -o jsonpath='{.spec.clusterResourceWhitelist}'   # empty
```

## 6. Patients table is seeded

The table is seeded by Terraform (30 synthetic records); the app never writes. An empty table after apply is a failure: rerun `terraform-apply` and check the `aws_dynamodb_table_item` resources in the plan.

```sh
aws dynamodb scan --table-name cloudbatch818-zein-hcsecops-patients --select COUNT --query Count   # expect 30
```

Before the second plan after seeding, the plan role must have `RefreshSeededPatientItems` (`dynamodb:GetItem` on the patients table) attached, from `docs/bootstrap-policies/plan-policy.json`. An `AccessDenied` on `dynamodb:GetItem` during refresh in `tf-plan` means that policy statement is missing, not that the table is broken.
