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

variable "rotation_lambda_arn" {
  description = "Lambda that rotates the secret (module secret-rotation)."
  type        = string
}

variable "rotation_days" {
  type    = number
  default = 30
}
