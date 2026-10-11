resource "aws_budgets_budget" "this" {
  name         = var.name
  budget_type  = "COST"
  limit_amount = tostring(var.limit_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  # Count only spend tagged with the project cost allocation tag; the account is shared (SEC-038).
  # The tag must be activated in Billing first (docs/runbooks/budget.md).
  cost_filter {
    name   = "TagKeyValue"
    values = [format("user:%s$%s", var.cost_tag_key, var.cost_tag_value)]
  }

  dynamic "notification" {
    for_each = var.actual_thresholds
    content {
      comparison_operator        = "GREATER_THAN"
      threshold                  = notification.value
      threshold_type             = "PERCENTAGE"
      notification_type          = "ACTUAL"
      subscriber_email_addresses = var.alert_emails
    }
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = var.forecast_threshold
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = var.alert_emails
  }
}
