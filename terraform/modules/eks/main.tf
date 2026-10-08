data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id
  region     = data.aws_region.current.region
  log_types  = ["api", "audit", "authenticator", "controllerManager", "scheduler"]
}

# ---------- control plane ----------

resource "aws_cloudwatch_log_group" "cluster" {
  name              = "/aws/eks/${var.name}/cluster"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.kms_key_arn
}

data "aws_iam_policy_document" "cluster_trust" {
  statement {
    actions = ["sts:AssumeRole", "sts:TagSession"]
    principals {
      type        = "Service"
      identifiers = ["eks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "cluster" {
  name               = "${var.role_prefix}-eks-cluster"
  assume_role_policy = data.aws_iam_policy_document.cluster_trust.json
}

resource "aws_iam_role_policy_attachment" "cluster" {
  role       = aws_iam_role.cluster.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"
}

resource "aws_eks_cluster" "this" {
  name                      = var.name
  version                   = var.kubernetes_version
  role_arn                  = aws_iam_role.cluster.arn
  enabled_cluster_log_types = local.log_types

  # vpc-cni and kube-proxy are DaemonSets, which cannot run on Fargate. Do not let EKS install the
  # self-managed defaults; CoreDNS comes from the managed add-on below.
  bootstrap_self_managed_addons = false

  # Access only through access entries; the creator gets no implicit admin.
  access_config {
    authentication_mode                         = "API"
    bootstrap_cluster_creator_admin_permissions = false
  }

  # D1: public and private endpoints. GitHub-hosted runners need the public endpoint; access is
  # controlled by IAM and access entries only.
  vpc_config {
    subnet_ids              = var.subnet_ids
    endpoint_private_access = true
    endpoint_public_access  = true
    public_access_cidrs     = ["0.0.0.0/0"]
  }

  encryption_config {
    resources = ["secrets"]
    provider {
      key_arn = var.kms_key_arn
    }
  }

  depends_on = [aws_iam_role_policy_attachment.cluster, aws_cloudwatch_log_group.cluster]
}

# ---------- Fargate ----------

data "aws_iam_policy_document" "fargate_trust" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["eks-fargate-pods.amazonaws.com"]
    }
    condition {
      test     = "ArnLike"
      variable = "aws:SourceArn"
      values   = ["arn:aws:eks:${local.region}:${local.account_id}:fargateprofile/${var.name}/*"]
    }
  }
}

resource "aws_iam_role" "fargate" {
  name               = "${var.role_prefix}-eks-fargate-pods"
  assume_role_policy = data.aws_iam_policy_document.fargate_trust.json
}

resource "aws_iam_role_policy_attachment" "fargate" {
  role       = aws_iam_role.fargate.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSFargatePodExecutionRolePolicy"
}

resource "aws_eks_fargate_profile" "this" {
  for_each = toset(var.fargate_namespaces)

  cluster_name           = aws_eks_cluster.this.name
  fargate_profile_name   = each.key
  pod_execution_role_arn = aws_iam_role.fargate.arn
  subnet_ids             = var.subnet_ids

  selector {
    namespace = each.key
  }

  depends_on = [aws_iam_role_policy_attachment.fargate]
}

# CoreDNS must be told it runs on Fargate, or its pods stay Pending without EC2 nodes.
resource "aws_eks_addon" "coredns" {
  cluster_name                = aws_eks_cluster.this.name
  addon_name                  = "coredns"
  addon_version               = var.coredns_version
  configuration_values        = jsonencode({ computeType = "Fargate" })
  resolve_conflicts_on_create = "OVERWRITE"
  resolve_conflicts_on_update = "OVERWRITE"

  depends_on = [aws_eks_fargate_profile.this]
}

# ---------- access ----------

resource "aws_eks_access_entry" "this" {
  for_each = var.access_entries

  cluster_name  = aws_eks_cluster.this.name
  principal_arn = each.value.principal_arn
  type          = "STANDARD"
}

resource "aws_eks_access_policy_association" "this" {
  for_each = var.access_entries

  cluster_name  = aws_eks_cluster.this.name
  principal_arn = aws_eks_access_entry.this[each.key].principal_arn
  policy_arn    = "arn:aws:eks::aws:cluster-access-policy/${each.value.policy}"

  access_scope {
    type       = length(each.value.namespaces) > 0 ? "namespace" : "cluster"
    namespaces = length(each.value.namespaces) > 0 ? each.value.namespaces : null
  }
}

# IRSA: the cluster's own OIDC provider (not the GitHub one).
resource "aws_iam_openid_connect_provider" "this" {
  url            = aws_eks_cluster.this.identity[0].oidc[0].issuer
  client_id_list = ["sts.amazonaws.com"]
}

# ---------- pod security groups (D3) ----------
# VPC CNI network policies do not apply to Fargate. Security groups for pods do, through a
# SecurityGroupPolicy in each namespace (Phase 4 chart), together with the cluster security group.

resource "aws_security_group" "pods" {
  for_each = toset(var.app_namespaces)

  name        = "${var.role_prefix}-pods-${each.key}"
  description = "App pods in ${each.key}, attached by SecurityGroupPolicy"
  vpc_id      = var.vpc_id

  tags = { Name = "${var.role_prefix}-pods-${each.key}" }
}

resource "aws_vpc_security_group_ingress_rule" "pods_from_alb" {
  for_each = aws_security_group.pods

  security_group_id = each.value.id
  description       = "App port from the ALB (in this VPC)"
  ip_protocol       = "tcp"
  from_port         = var.app_port
  to_port           = var.app_port
  cidr_ipv4         = var.vpc_cidr
}

resource "aws_vpc_security_group_egress_rule" "pods_https" {
  for_each = aws_security_group.pods

  security_group_id = each.value.id
  description       = "HTTPS to AWS APIs (DynamoDB, Secrets Manager, KMS) through the NAT gateway"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_vpc_security_group_egress_rule" "pods_dns" {
  for_each = {
    for pair in setproduct(keys(aws_security_group.pods), ["tcp", "udp"]) :
    "${pair[0]}-${pair[1]}" => { ns = pair[0], proto = pair[1] }
  }

  security_group_id = aws_security_group.pods[each.value.ns].id
  description       = "DNS to CoreDNS pods"
  ip_protocol       = each.value.proto
  from_port         = 53
  to_port           = 53
  cidr_ipv4         = var.vpc_cidr
}
