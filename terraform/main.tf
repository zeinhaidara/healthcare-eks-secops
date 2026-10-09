module "kms" {
  source = "./modules/kms"

  name = "${var.name_prefix}-main"
  # CloudWatch Logs groups this key may encrypt.
  log_group_prefixes = ["/${var.name_prefix}", "/aws/lambda/${var.name_prefix}", "/aws/eks/${var.cluster_name}"]
  # The detective trail may encrypt its log files with this key (ARN built from names, no IDs).
  cloudtrail_trail_arns = [local.trail_arn]
}

module "network" {
  source = "./modules/network"

  name               = var.name_prefix
  vpc_cidr           = var.vpc_cidr
  availability_zones = [for s in var.az_suffixes : "${var.aws_region}${s}"]
  cluster_name       = var.cluster_name
  kms_key_arn        = module.kms.key_arn
  log_retention_days = var.log_retention_days
}

module "ecr" {
  source = "./modules/ecr"

  name        = var.ecr_repository
  kms_key_arn = module.kms.key_arn
}

module "secrets" {
  source = "./modules/secrets"

  name                = "${var.name_prefix}-api-key"
  kms_key_arn         = module.kms.key_arn
  rotation_lambda_arn = module.secret_rotation.function_arn
}

module "dynamodb" {
  source = "./modules/dynamodb"

  name        = "${var.name_prefix}-patients"
  kms_key_arn = module.kms.key_arn
}

module "budget" {
  source = "./modules/budget"

  name         = "${var.name_prefix}-monthly"
  limit_usd    = var.monthly_budget_usd
  alert_emails = [var.alert_email]
}

module "secret_rotation" {
  source = "./modules/secret-rotation"

  name               = "${var.name_prefix}-rotate-api-key"
  secret_arn         = module.secrets.secret_arn
  kms_key_arn        = module.kms.key_arn
  vpc_id             = module.network.vpc_id
  subnet_ids         = module.network.private_subnet_ids
  log_retention_days = var.log_retention_days
}

data "aws_caller_identity" "current" {}

locals {
  # CI roles are created by hand (docs/bootstrap.md); only their names are known here.
  ci_role_arn = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/${var.name_prefix}-gha"
  deploy_namespaces = {
    dev  = var.app_namespaces[0]
    prod = var.app_namespaces[1]
  }
}

module "eks" {
  source = "./modules/eks"

  name               = var.cluster_name
  kubernetes_version = var.cluster_version
  role_prefix        = var.name_prefix
  vpc_id             = module.network.vpc_id
  vpc_cidr           = module.network.vpc_cidr
  subnet_ids         = module.network.private_subnet_ids
  kms_key_arn        = module.kms.key_arn
  log_retention_days = var.log_retention_days
  fargate_namespaces = concat(["kube-system"], var.app_namespaces)
  app_namespaces     = var.app_namespaces
  coredns_version    = var.coredns_version

  access_entries = merge(
    {
      for env, ns in local.deploy_namespaces : "deploy-${env}" => {
        principal_arn = "${local.ci_role_arn}-deploy-${env}"
        policy        = "AmazonEKSEditPolicy"
        namespaces    = [ns]
      }
    },
    {
      # D2a: the apply role is cluster admin, used only behind the infra approval (EXC row).
      apply = {
        principal_arn = "${local.ci_role_arn}-apply"
        policy        = "AmazonEKSClusterAdminPolicy"
        namespaces    = []
      }
    },
  )
}

module "acm" {
  source = "./modules/acm"

  domain_name = "*.${var.domain_name}"
  zone_id     = var.route53_zone_id
}

# App pods: read patients, read the API key, decrypt with the project key. Nothing else.
data "aws_iam_policy_document" "app" {
  statement {
    sid       = "ReadPatientsTable"
    actions   = ["dynamodb:GetItem", "dynamodb:Query", "dynamodb:Scan"]
    resources = [module.dynamodb.table_arn]
  }

  statement {
    sid       = "ReadApiKey"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [module.secrets.secret_arn]
  }

  statement {
    sid       = "DecryptWithProjectKey"
    actions   = ["kms:Decrypt"]
    resources = [module.kms.key_arn]
  }
}

module "irsa_app" {
  source   = "./modules/irsa"
  for_each = local.deploy_namespaces

  name              = "${var.name_prefix}-app-${each.key}"
  oidc_provider_arn = module.eks.oidc_provider_arn
  oidc_issuer       = module.eks.oidc_issuer
  namespace         = each.value
  service_account   = "healthcare-api"
  policy_json       = data.aws_iam_policy_document.app.json
}

# Upstream policy for the controller version in cluster-addons (D4), unmodified apart from
# whitespace. Its wildcards are listed in docs/bootstrap-policies/README.md for Phase 7.
module "irsa_lb_controller" {
  source = "./modules/irsa"

  name              = "${var.name_prefix}-lb-controller"
  oidc_provider_arn = module.eks.oidc_provider_arn
  oidc_issuer       = module.eks.oidc_issuer
  namespace         = "kube-system"
  service_account   = "aws-load-balancer-controller"
  policy_json       = jsonencode(jsondecode(file("${path.module}/policies/aws-load-balancer-controller-v3.6.0.json")))
}

# Operator: read-only cluster access. Created by hand in the EKS console, then brought under
# Terraform by import (docs/runbooks/eks-operator-import.md). View policy only, cluster scope.
locals {
  operator_principal_arn = coalesce(
    var.operator_principal_arn,
    "arn:aws:iam::${data.aws_caller_identity.current.account_id}:user/${var.operator_iam_user_name}",
  )
}

resource "aws_eks_access_entry" "operator" {
  cluster_name  = module.eks.cluster_name
  principal_arn = local.operator_principal_arn
  type          = "STANDARD"
  user_name     = var.operator_kubernetes_username

  depends_on = [module.eks]
}

resource "aws_eks_access_policy_association" "operator_view" {
  cluster_name  = module.eks.cluster_name
  principal_arn = aws_eks_access_entry.operator.principal_arn
  policy_arn    = "arn:aws:eks::aws:cluster-access-policy/AmazonEKSViewPolicy"

  access_scope {
    type = "cluster"
  }

  depends_on = [module.eks]
}

# Detective controls (Phase 7 step 1): Security Hub, GuardDuty and a single-region CloudTrail.
locals {
  trail_name = "${var.name_prefix}-trail"
  trail_arn  = "arn:aws:cloudtrail:${var.aws_region}:${data.aws_caller_identity.current.account_id}:trail/${local.trail_name}"
}

module "detective" {
  source = "./modules/detective"

  name        = var.name_prefix
  trail_name  = local.trail_name
  kms_key_arn = module.kms.key_arn
}
