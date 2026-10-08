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
