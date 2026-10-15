# Looked up by tag and name, never by ID.
data "aws_vpc" "this" {
  tags = {
    Name = var.name_prefix
  }
}

data "aws_iam_role" "lb_controller" {
  name = "${var.name_prefix}-lb-controller"
}

# App namespaces, enforced at Pod Security "restricted".
resource "kubernetes_namespace_v1" "app" {
  for_each = toset(var.app_namespaces)

  metadata {
    name = each.key
    labels = {
      "pod-security.kubernetes.io/enforce"         = "restricted"
      "pod-security.kubernetes.io/enforce-version" = "latest"
      "pod-security.kubernetes.io/audit"           = "restricted"
      "pod-security.kubernetes.io/audit-version"   = "latest"
      "pod-security.kubernetes.io/warn"            = "restricted"
      "pod-security.kubernetes.io/warn-version"    = "latest"
    }
  }
}

# AWS Load Balancer Controller on Fargate: no instance metadata, so region and VPC are set
# explicitly, and targets are IPs (Fargate supports only IP targets).
resource "helm_release" "lb_controller" {
  name       = "aws-load-balancer-controller"
  repository = "https://aws.github.io/eks-charts"
  chart      = "aws-load-balancer-controller"
  version    = var.lbc_chart_version
  namespace  = "kube-system"
  atomic     = true
  wait       = true
  timeout    = 600

  values = [yamlencode({
    clusterName       = var.cluster_name
    region            = var.aws_region
    vpcId             = data.aws_vpc.this.id
    defaultTargetType = "ip"
    image = {
      tag = var.lbc_image_tag
    }
    serviceAccount = {
      create = true
      name   = "aws-load-balancer-controller"
      annotations = {
        "eks.amazonaws.com/role-arn" = data.aws_iam_role.lb_controller.arn
      }
    }
  })]
}

# Security groups for pods on Fargate (closes EXC-007 once the smoke test proves attachment).
# Owned here, not by the chart: the deploy roles use AmazonEKSEditPolicy, which has no rule for the
# vpcresources.k8s.aws API group. The apply role (cluster admin, behind the infra approval) creates
# these. The groups are found by name in the project VPC and from the cluster, never by ID.
data "aws_security_group" "pods" {
  for_each = toset(var.app_namespaces)

  name   = "${var.name_prefix}-pods-${each.key}"
  vpc_id = data.aws_vpc.this.id
}

locals {
  # Must match the chart's selector labels (helm/healthcare-api/templates/_helpers.tpl):
  # app.kubernetes.io/name is the chart name and app.kubernetes.io/instance is the release name.
  app_selector_labels = {
    "app.kubernetes.io/name"     = var.app_name
    "app.kubernetes.io/instance" = var.app_name
  }
  cluster_security_group_id = data.aws_eks_cluster.this.vpc_config[0].cluster_security_group_id
}

# Pods created after this policy get the groups; running pods need a restart to pick them up.
# The pod group comes first, then the cluster group, which Fargate pods need to reach the control
# plane (https://repost.aws/knowledge-center/eks-configure-fargate-pod-security-group).
resource "kubernetes_manifest" "security_group_policy" {
  for_each = toset(var.app_namespaces)

  manifest = {
    apiVersion = "vpcresources.k8s.aws/v1beta1"
    kind       = "SecurityGroupPolicy"
    metadata = {
      name      = var.app_name
      namespace = each.key
      labels    = local.app_selector_labels
    }
    spec = {
      podSelector = {
        matchLabels = local.app_selector_labels
      }
      securityGroups = {
        groupIds = [
          data.aws_security_group.pods[each.key].id,
          local.cluster_security_group_id,
        ]
      }
    }
  }

  depends_on = [kubernetes_namespace_v1.app]
}

# ---------- metrics-server (kubectl top, and the HPA when it is enabled) ----------
# Runs on Fargate in kube-system; the values file moves it off port 10250, which Fargate reserves.
resource "helm_release" "metrics_server" {
  name       = "metrics-server"
  repository = "https://kubernetes-sigs.github.io/metrics-server/"
  chart      = "metrics-server"
  version    = var.metrics_server_chart_version
  namespace  = "kube-system"
  atomic     = true
  wait       = true
  timeout    = 600

  values = [file("${path.module}/values/metrics-server.yaml")]
}

# ---------- Argo CD ----------
# Argo has no AWS role. It reads Git with a read-only deploy key held in the Secret "healthcare-repo",
# which is created by hand and never by Terraform (docs/runbooks/argocd-bootstrap.md). It deploys with
# the in-cluster RBAC from its own install. The "argocd" Fargate profile is created in the root.
resource "kubernetes_namespace_v1" "argocd" {
  metadata {
    name = "argocd"
    labels = {
      "pod-security.kubernetes.io/enforce" = "baseline"
      "pod-security.kubernetes.io/audit"   = "restricted"
      "pod-security.kubernetes.io/warn"    = "restricted"
    }
  }
}

resource "helm_release" "argocd" {
  name       = "argocd"
  repository = "https://argoproj.github.io/argo-helm"
  chart      = "argo-cd"
  version    = var.argocd_chart_version
  namespace  = kubernetes_namespace_v1.argocd.metadata[0].name
  atomic     = true
  wait       = true
  timeout    = 900

  values = [file("${path.module}/values/argocd.yaml")]
}

# ---------- app ServiceAccounts (IRSA) ----------
# Terraform owns the ServiceAccount and its role annotation; the chart refers to it by name and never
# sets a role ARN. The role is created in the root (module.irsa_app) and looked up by name here.
locals {
  app_env_namespaces = {
    dev  = var.app_namespaces[0]
    prod = var.app_namespaces[1]
  }
}

data "aws_iam_role" "app" {
  for_each = local.app_env_namespaces

  name = "${var.name_prefix}-app-${each.key}"
}

resource "kubernetes_service_account_v1" "app" {
  for_each = local.app_env_namespaces

  metadata {
    name      = var.app_name
    namespace = each.value
    annotations = {
      "eks.amazonaws.com/role-arn" = data.aws_iam_role.app[each.key].arn
    }
  }

  # The IRSA webhook adds its own projected token; the default API token is not needed.
  automount_service_account_token = false

  depends_on = [kubernetes_namespace_v1.app]
}
