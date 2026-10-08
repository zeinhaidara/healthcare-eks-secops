module "kms" {
  source = "./modules/kms"

  name = "${var.name_prefix}-main"
  # CloudWatch Logs groups this key may encrypt.
  log_group_prefixes = ["/${var.name_prefix}"]
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

  name        = "${var.name_prefix}-api-key"
  kms_key_arn = module.kms.key_arn
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
