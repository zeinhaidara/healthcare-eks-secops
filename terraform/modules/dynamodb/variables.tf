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
