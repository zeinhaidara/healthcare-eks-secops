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

# Must stay "synthetic". Do not set "phi" anywhere until the Phase 7 items are closed (state
# encrypted with KMS, EXC-008; plan-role read of items, EXC-004; real-data handling reviewed).
variable "data_classification" {
  description = "DataClassification tag on the patients table."
  type        = string
  default     = "synthetic"

  validation {
    condition     = contains(["synthetic", "phi"], var.data_classification)
    error_message = "data_classification must be \"synthetic\" or \"phi\"."
  }
}
