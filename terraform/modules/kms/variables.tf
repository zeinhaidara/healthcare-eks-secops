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

variable "sns_service_publishers" {
  description = "AWS service principals that publish to the encrypted SNS topics below (for example cloudtrail.amazonaws.com)."
  type        = list(string)
  default     = []
}

variable "sns_topic_arns" {
  description = "SNS topics encrypted with this key that the service publishers may use. Empty means no statement."
  type        = list(string)
  default     = []
}
