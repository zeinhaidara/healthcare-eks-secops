# Secret shell only. The value is set by hand in the console and never enters Terraform state.
resource "aws_secretsmanager_secret" "this" {
  name                    = var.name
  kms_key_id              = var.kms_key_arn
  recovery_window_in_days = var.recovery_window_in_days
}

# First rotation happens after rotation_days; the key is set by hand before then.
resource "aws_secretsmanager_secret_rotation" "this" {
  secret_id           = aws_secretsmanager_secret.this.id
  rotation_lambda_arn = var.rotation_lambda_arn
  rotate_immediately  = false

  rotation_rules {
    automatically_after_days = var.rotation_days
  }
}
