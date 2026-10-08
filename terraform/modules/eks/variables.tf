variable "name" {
  description = "Cluster name (CLUSTER_NAME)."
  type        = string
}

variable "kubernetes_version" {
  description = "Kubernetes version (CLUSTER_VERSION)."
  type        = string
}

variable "role_prefix" {
  description = "Prefix for IAM role and security group names (the apply role is scoped to it)."
  type        = string
}

variable "vpc_id" {
  type = string
}

variable "vpc_cidr" {
  description = "Used for pod security group rules (ALB to pods, pods to CoreDNS)."
  type        = string
}

variable "subnet_ids" {
  description = "Private subnets for control plane ENIs and Fargate pods."
  type        = list(string)
}

variable "kms_key_arn" {
  description = "Encrypts Kubernetes secrets and the control plane log group."
  type        = string
}

variable "log_retention_days" {
  type    = number
  default = 365
}

variable "fargate_namespaces" {
  description = "Namespaces that get a Fargate profile. Pods in other namespaces will not schedule."
  type        = list(string)
}

variable "app_namespaces" {
  description = "Application namespaces. Each gets a pod security group for SecurityGroupPolicy."
  type        = list(string)
}

variable "app_port" {
  type    = number
  default = 8080
}

variable "coredns_version" {
  description = "Pinned CoreDNS managed add-on version."
  type        = string
}

variable "access_entries" {
  description = "IAM principals allowed into the cluster. Empty namespaces means cluster scope."
  type = map(object({
    principal_arn = string
    policy        = string
    namespaces    = list(string)
  }))
}
