variable "name" {
  type = string
}

variable "kms_key_arn" {
  type = string
}

variable "recovery_window_in_days" {
  description = "0 deletes immediately so the name can be reused after destroy."
  type        = number
  default     = 0
}
