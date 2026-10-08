variable "name" {
  type = string
}

variable "kms_key_arn" {
  type = string
}

variable "keep_tagged" {
  description = "Number of tagged images to keep."
  type        = number
  default     = 10
}

variable "expire_untagged_days" {
  type    = number
  default = 7
}

variable "force_delete" {
  description = "Allow destroy while images exist (the stack is destroyed after each session)."
  type        = bool
  default     = true
}
