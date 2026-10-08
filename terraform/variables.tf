# Values come from GitHub variables as TF_VAR_* in terraform-apply.yml.

variable "aws_region" {
  description = "AWS region (AWS_REGION)."
  type        = string
}

variable "project_name" {
  description = "Project tag value (PROJECT_NAME)."
  type        = string
}

variable "owner" {
  description = "Owner tag value (OWNER)."
  type        = string
}

variable "name_prefix" {
  description = "Prefix for every resource name."
  type        = string
  default     = "cloudbatch818-zein-hcsecops"
}

variable "cluster_name" {
  description = "EKS cluster name (CLUSTER_NAME). Used for now only to tag subnets for the load balancer controller."
  type        = string
}

variable "vpc_cidr" {
  description = "VPC CIDR block (VPC_CIDR)."
  type        = string
}

variable "az_suffixes" {
  description = "AZ letters appended to the region (us-east-2a, us-east-2b)."
  type        = list(string)
  default     = ["a", "b"]
}

variable "ecr_repository" {
  description = "ECR repository name (ECR_REPOSITORY)."
  type        = string
}

variable "alert_email" {
  description = "Email for budget alerts (ALERT_EMAIL)."
  type        = string
}

variable "monthly_budget_usd" {
  description = "Monthly budget in USD."
  type        = number
  default     = 75
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days (365 satisfies CKV_AWS_338)."
  type        = number
  default     = 365
}

variable "cluster_version" {
  description = "Kubernetes version (CLUSTER_VERSION)."
  type        = string
}

variable "domain_name" {
  description = "Base domain (DOMAIN_NAME). The ACM certificate is *.<domain_name>."
  type        = string
}

variable "route53_zone_id" {
  description = "Hosted zone for ACM validation records (ROUTE53_ZONE_ID)."
  type        = string
}

variable "app_namespaces" {
  description = "Application namespaces (one per environment)."
  type        = list(string)
  default     = ["cloudbatch818-healthcare-dev", "cloudbatch818-healthcare-prod"]
}

variable "coredns_version" {
  description = "CoreDNS managed add-on version (EKS default for the cluster version)."
  type        = string
  default     = "v1.12.4-eksbuild.38"
}
