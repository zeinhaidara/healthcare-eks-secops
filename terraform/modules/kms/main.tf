data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id
  region     = data.aws_region.current.region
  log_group_arns = [
    for p in var.log_group_prefixes :
    "arn:aws:logs:${local.region}:${local.account_id}:log-group:${p}*"
  ]
}

data "aws_iam_policy_document" "key" {
  # In a KMS key policy, resource "*" means "this key" only; it cannot reach any other key.
  # The account root statement is what lets IAM policies (apply role, IRSA roles) grant use of the key.
  # Owner approval needed per CLAUDE.md (wildcard resource).
  statement {
    sid       = "AccountAdminViaIam"
    actions   = ["kms:*"]
    resources = ["*"]
    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${local.account_id}:root"]
    }
  }

  dynamic "statement" {
    for_each = length(local.log_group_arns) > 0 ? [1] : []
    content {
      sid = "CloudWatchLogsEncrypt"
      actions = [
        "kms:Encrypt*",
        "kms:Decrypt*",
        "kms:ReEncrypt*",
        "kms:GenerateDataKey*",
        "kms:Describe*",
      ]
      resources = ["*"] # this key only, see above
      principals {
        type        = "Service"
        identifiers = ["logs.${local.region}.amazonaws.com"]
      }
      condition {
        test     = "ArnLike"
        variable = "kms:EncryptionContext:aws:logs:arn"
        values   = local.log_group_arns
      }
    }
  }
}

resource "aws_kms_key" "this" {
  description             = "${var.name}: EKS secrets, ECR, CloudWatch Logs, Secrets Manager, DynamoDB"
  enable_key_rotation     = true
  deletion_window_in_days = 7
  policy                  = data.aws_iam_policy_document.key.json
}

resource "aws_kms_alias" "this" {
  name          = "alias/${var.name}"
  target_key_id = aws_kms_key.this.key_id
}
