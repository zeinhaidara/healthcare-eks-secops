# Outputs that hold an ARN or the account ID (the ECR URL and the trail bucket name contain it) are
# sensitive, so terraform apply prints <sensitive> instead of the value in the public job log.
# Read one locally with `terraform output -raw <name>`. Nothing in CI reads these outputs.

output "kms_key_arn" {
  value     = module.kms.key_arn
  sensitive = true
}

output "vpc_id" {
  value = module.network.vpc_id
}

output "public_subnet_ids" {
  value = module.network.public_subnet_ids
}

output "private_subnet_ids" {
  value = module.network.private_subnet_ids
}

output "ecr_repository_url" {
  value     = module.ecr.repository_url
  sensitive = true
}

output "api_key_secret_arn" {
  value     = module.secrets.secret_arn
  sensitive = true
}

output "api_key_secret_name" {
  value = module.secrets.secret_name
}

output "dynamodb_table_name" {
  value = module.dynamodb.table_name
}

output "dynamodb_table_arn" {
  value     = module.dynamodb.table_arn
  sensitive = true
}

output "cluster_name" {
  value = module.eks.cluster_name
}

output "cluster_endpoint" {
  value = module.eks.cluster_endpoint
}

output "cluster_security_group_id" {
  value = module.eks.cluster_security_group_id
}

output "oidc_provider_arn" {
  value     = module.eks.oidc_provider_arn
  sensitive = true
}

output "pod_security_group_ids" {
  value = module.eks.pod_security_group_ids
}

output "certificate_arn" {
  value     = module.acm.certificate_arn
  sensitive = true
}

output "app_role_arns" {
  value     = { for env, m in module.irsa_app : env => m.role_arn }
  sensitive = true
}

output "lb_controller_role_arn" {
  value     = module.irsa_lb_controller.role_arn
  sensitive = true
}

output "detective_trail_bucket" {
  value     = module.detective.trail_bucket_name
  sensitive = true
}

output "guardduty_detector_id" {
  value = module.detective.guardduty_detector_id
}
