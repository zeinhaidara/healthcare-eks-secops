variable "name" {
  type = string
}

variable "limit_usd" {
  type = number
}

variable "alert_emails" {
  type = list(string)
}

variable "actual_thresholds" {
  description = "Percent of the budget at which actual spend alerts."
  type        = list(number)
  default     = [50, 80, 100]
}

variable "forecast_threshold" {
  description = "Percent of the budget at which forecast spend alerts."
  type        = number
  default     = 100
}

variable "cost_tag_key" {
  description = "Cost allocation tag key the budget is filtered on. Must be activated as a cost allocation tag in Billing."
  type        = string
  default     = "Project"
}

variable "cost_tag_value" {
  description = "Value of the cost allocation tag the budget is filtered on (the project's Project tag)."
  type        = string
  default     = "cloudbatch818"
}
