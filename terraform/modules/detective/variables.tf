variable "name" {
  description = "Resource name prefix (name_prefix)."
  type        = string
}

variable "trail_name" {
  description = "CloudTrail trail name. The KMS key policy allows exactly this trail, so the root builds its ARN from the same value."
  type        = string
}

variable "kms_key_arn" {
  description = "Project KMS key used for the trail bucket and the trail's log file encryption."
  type        = string
}

variable "log_expiration_days" {
  description = "Days before current CloudTrail log objects expire."
  type        = number
  default     = 365
}

variable "noncurrent_expiration_days" {
  description = "Days before old object versions expire."
  type        = number
  default     = 30
}

variable "force_destroy" {
  description = "Allow terraform destroy while the bucket holds logs (the stack is destroyed after each session). Audit logs are lost on destroy when true."
  type        = bool
  default     = true
}

variable "sns_topic_name" {
  description = "SNS topic for CloudTrail and trail-bucket notifications. The KMS key policy allows publishers for exactly this topic, so the root builds its ARN from the same value."
  type        = string
}

variable "log_retention_days" {
  description = "Retention of the CloudTrail CloudWatch Logs log group."
  type        = number
  default     = 365
}
