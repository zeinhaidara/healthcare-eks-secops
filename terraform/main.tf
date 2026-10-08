module "kms" {
  source = "./modules/kms"

  name = "${var.name_prefix}-main"
  # CloudWatch Logs groups this key may encrypt.
  log_group_prefixes = ["/${var.name_prefix}", "/aws/lambda/${var.name_prefix}", "/aws/eks/${var.cluster_name}"]
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
