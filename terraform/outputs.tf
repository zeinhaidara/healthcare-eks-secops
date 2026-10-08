output "kms_key_arn" {
  value = module.kms.key_arn
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
  value = module.ecr.repository_url
}

output "api_key_secret_arn" {
  value = module.secrets.secret_arn
}

output "api_key_secret_name" {
  value = module.secrets.secret_name
}

output "dynamodb_table_name" {
  value = module.dynamodb.table_name
}

output "dynamodb_table_arn" {
  value = module.dynamodb.table_arn
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
  value = module.eks.oidc_provider_arn
}

output "pod_security_group_ids" {
  value = module.eks.pod_security_group_ids
}

output "certificate_arn" {
  value = module.acm.certificate_arn
}
