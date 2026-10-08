# Values come from GitHub variables as TF_VAR_* in terraform-apply.yml.

variable "aws_region" {
  type = string
}

variable "project_name" {
  type = string
}

variable "owner" {
  type = string
}

variable "name_prefix" {
  type    = string
  default = "cloudbatch818-zein-hcsecops"
}

variable "cluster_name" {
  type = string
}

variable "app_namespaces" {
  type    = list(string)
  default = ["cloudbatch818-healthcare-dev", "cloudbatch818-healthcare-prod"]
}

variable "lbc_chart_version" {
  description = "aws-load-balancer-controller Helm chart (eks-charts)."
  type        = string
  default     = "3.6.0"
}

variable "lbc_image_tag" {
  description = "Controller image tag; must match the chart's appVersion and the IAM policy version."
  type        = string
  default     = "v3.6.0"
}
