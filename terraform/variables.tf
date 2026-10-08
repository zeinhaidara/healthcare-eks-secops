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
  description = "CloudWatch log retention."
  type        = number
  default     = 30
}
