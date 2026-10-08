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
