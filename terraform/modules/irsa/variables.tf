variable "name" {
  description = "Role name (must start with the project prefix)."
  type        = string
}

variable "oidc_provider_arn" {
  type = string
}

variable "oidc_issuer" {
  description = "Issuer host and path without https://."
  type        = string
}

variable "namespace" {
  type = string
}

variable "service_account" {
  type = string
}

variable "policy_json" {
  description = "Inline permissions policy."
  type        = string
}
