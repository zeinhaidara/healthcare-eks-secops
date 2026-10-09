variable "name" {
  description = "Key alias name (without the alias/ prefix)."
  type        = string
}

variable "log_group_prefixes" {
  description = "CloudWatch log group name prefixes this key may encrypt."
  type        = list(string)
  default     = []
}

variable "cloudtrail_trail_arns" {
  description = "CloudTrail trail ARNs allowed to encrypt log files with this key. Empty means no CloudTrail statement."
  type        = list(string)
  default     = []
}
