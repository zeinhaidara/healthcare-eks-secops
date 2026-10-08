variable "name" {
  type = string
}

variable "kms_key_arn" {
  type = string
}

variable "hash_key" {
  type    = string
  default = "patient_id"
}

variable "number_attributes" {
  description = "Seed attributes stored as DynamoDB numbers (N); all others are strings (S)."
  type        = list(string)
  default     = ["age"]
}
