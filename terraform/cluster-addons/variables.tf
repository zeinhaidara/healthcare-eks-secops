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

variable "app_name" {
  description = "Chart name and Helm release name; the SecurityGroupPolicy selects pods by these labels."
  type        = string
  default     = "healthcare-api"
}

variable "argocd_chart_version" {
  description = "argo-cd Helm chart (argo-helm)."
  type        = string
  default     = "10.10.5"
}

variable "metrics_server_chart_version" {
  description = "metrics-server Helm chart (kubernetes-sigs)."
  type        = string
  default     = "3.14.0"
}

variable "external_secrets_chart_version" {
  description = "external-secrets Helm chart (charts.external-secrets.io)."
  type        = string
  default     = "2.11.0"
}

variable "github_app_secret_name" {
  description = "Secrets Manager secret (by name) that holds the Argo CD GitHub App credential as JSON: githubAppID, githubAppInstallationID, githubAppPrivateKey. Created by hand."
  type        = string
  default     = "healthcare/argocd/github-app"
}

variable "argocd_repo_url" {
  description = "Repository Argo CD reads, over HTTPS with the GitHub App."
  type        = string
  default     = "https://github.com/zeinhaidara/healthcare-eks-secops.git"
}
