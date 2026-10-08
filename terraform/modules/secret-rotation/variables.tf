variable "name" {
  description = "Function name. Its log group is /aws/lambda/<name>."
  type        = string
}

variable "secret_arn" {
  type = string
}

variable "kms_key_arn" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "subnet_ids" {
  description = "Private subnets for the function."
  type        = list(string)
}

variable "log_retention_days" {
  type    = number
  default = 365
}

variable "reserved_concurrency" {
  type    = number
  default = 1
}
