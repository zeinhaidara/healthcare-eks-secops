# Secret shell only. The value is set by hand in the console and never enters Terraform state.
resource "aws_secretsmanager_secret" "this" {
  name                    = var.name
  kms_key_id              = var.kms_key_arn
  recovery_window_in_days = var.recovery_window_in_days
}
