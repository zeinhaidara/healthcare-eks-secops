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
  # checkov:skip=CKV_AWS_109:Account-root statement is required in every KMS key policy, otherwise the key becomes unmanageable; "*" means this key only. owner Moulaye, expires 2027-04-08. EXC-001
  # checkov:skip=CKV_AWS_111:Same account-root statement as CKV_AWS_109. owner Moulaye, expires 2027-04-08. EXC-001
  # checkov:skip=CKV_AWS_356:Same account-root statement as CKV_AWS_109; resource "*" in a key policy is this key only. owner Moulaye, expires 2027-04-08. EXC-001
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

  # CloudTrail log file encryption for the named trail(s) only. "*" as the resource in a key policy
  # means this key. The encryption context pins the account's trails, as in the AWS documented policy.
  dynamic "statement" {
    for_each = length(var.cloudtrail_trail_arns) > 0 ? [1] : []
    content {
      sid       = "CloudTrailEncryptLogs"
      actions   = ["kms:GenerateDataKey*", "kms:DescribeKey"]
      resources = ["*"]
      principals {
        type        = "Service"
        identifiers = ["cloudtrail.amazonaws.com"]
      }
      condition {
        test     = "StringEquals"
        variable = "aws:SourceArn"
        values   = var.cloudtrail_trail_arns
      }
      condition {
        test     = "StringLike"
        variable = "kms:EncryptionContext:aws:cloudtrail:arn"
        values   = ["arn:aws:cloudtrail:*:${local.account_id}:trail/*"]
      }
    }
  }

  # AWS services publishing to an SNS topic encrypted with this key need data keys. Limited by the SNS
  # encryption context to the named topics only.
  dynamic "statement" {
    for_each = length(var.sns_topic_arns) > 0 && length(var.sns_service_publishers) > 0 ? [1] : []
    content {
      sid       = "ServicePublishersToEncryptedTopics"
      actions   = ["kms:GenerateDataKey*", "kms:Decrypt"]
      resources = ["*"]
      principals {
        type        = "Service"
        identifiers = var.sns_service_publishers
      }
      condition {
        test     = "StringEquals"
        variable = "kms:EncryptionContext:aws:sns:topicArn"
        values   = var.sns_topic_arns
      }
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
