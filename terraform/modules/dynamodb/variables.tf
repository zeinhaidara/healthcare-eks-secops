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
  description = "Seed attributes stored as DynamoDB numbers (N). Attributes in neither list are strings (S)."
  type        = list(string)
  default = [
    "age", "height_cm", "weight_kg",
    "systolic_bp", "diastolic_bp", "heart_rate", "temperature_c", "hba1c_percent", "egfr_ml_min",
  ]
}

variable "list_attributes" {
  description = "Seed attributes stored as DynamoDB lists of strings (L of S)."
  type        = list(string)
  default     = ["conditions", "medications", "allergies", "care_team"]
}

# Must stay "synthetic" until EXC-004 and EXC-008 are closed and real-data handling is reviewed.
variable "data_classification" {
  description = "DataClassification tag on the patients table."
  type        = string
  default     = "synthetic"

  validation {
    condition     = contains(["synthetic", "phi"], var.data_classification)
    error_message = "data_classification must be \"synthetic\" or \"phi\"."
  }
}
