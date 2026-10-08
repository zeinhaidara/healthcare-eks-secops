data "aws_caller_identity" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id
}

data "archive_file" "code" {
  type        = "zip"
  source_dir  = "${path.module}/src"
  output_path = "${path.module}/build/${var.name}.zip"
}

resource "aws_cloudwatch_log_group" "this" {
  name              = "/aws/lambda/${var.name}"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.kms_key_arn
}

resource "aws_sqs_queue" "dlq" {
  name              = "${var.name}-dlq"
  kms_master_key_id = var.kms_key_arn
}

resource "aws_security_group" "this" {
  name        = var.name
  description = "Rotation Lambda: HTTPS egress only, no ingress"
  vpc_id      = var.vpc_id

  tags = { Name = var.name }
}

# Reaches Secrets Manager and KMS through the NAT gateway.
resource "aws_vpc_security_group_egress_rule" "https" {
  security_group_id = aws_security_group.this.id
  description       = "HTTPS to AWS APIs"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  cidr_ipv4         = "0.0.0.0/0"
}

data "aws_iam_policy_document" "trust" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

data "aws_iam_policy_document" "permissions" {
  statement {
    sid = "RotateThisSecretOnly"
    actions = [
      "secretsmanager:GetSecretValue",
      "secretsmanager:PutSecretValue",
      "secretsmanager:DescribeSecret",
      "secretsmanager:UpdateSecretVersionStage",
    ]
    resources = [var.secret_arn]
  }

  statement {
    sid       = "UseProjectKey"
    actions   = ["kms:Decrypt", "kms:GenerateDataKey"]
    resources = [var.kms_key_arn]
  }

  statement {
    sid       = "WriteOwnLogs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.this.arn}:*"]
  }

  statement {
    sid       = "DeadLetter"
    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.dlq.arn]
  }

  # VPC-attached Lambda: the exact EC2 actions of the AWS managed policy
  # AWSLambdaVPCAccessExecutionRole (plus DescribeSecurityGroups and DescribeVpcs), on "*".
  # Lambda checks these permissions when the function is created, before any network interface
  # exists, so ARN- or condition-scoped grants fail that check ("does not have permissions to call
  # DeleteNetworkInterface on EC2"). No other ec2: action is granted. Accepted exception: EXC-009.
  statement {
    sid = "VpcLambdaNetworkInterfaces"
    actions = [
      "ec2:CreateNetworkInterface",
      "ec2:DescribeNetworkInterfaces",
      "ec2:DeleteNetworkInterface",
      "ec2:DescribeSubnets",
      "ec2:DescribeSecurityGroups",
      "ec2:DescribeVpcs",
      "ec2:AssignPrivateIpAddresses",
      "ec2:UnassignPrivateIpAddresses",
    ]
    resources = ["*"]
  }

  statement {
    sid       = "XrayWrite"
    actions   = ["xray:PutTraceSegments", "xray:PutTelemetryRecords"]
    resources = ["*"]
  }
}

resource "aws_iam_role" "this" {
  name               = var.name
  assume_role_policy = data.aws_iam_policy_document.trust.json
}

resource "aws_iam_role_policy" "this" {
  name   = "rotate-api-key"
  role   = aws_iam_role.this.id
  policy = data.aws_iam_policy_document.permissions.json
}

resource "aws_lambda_function" "this" {
  # checkov:skip=CKV_AWS_272:Code signing needs an AWS Signer profile and a signing step before deploy, a pipeline change planned for Phase 7. Code is a small file in this repo, packaged by Terraform from reviewed source. owner Moulaye, expires 2027-04-08. EXC-002
  function_name = var.name
  role          = aws_iam_role.this.arn
  runtime       = "python3.12"
  handler       = "lambda_function.lambda_handler"
  timeout       = 30

  filename         = data.archive_file.code.output_path
  source_code_hash = data.archive_file.code.output_base64sha256

  kms_key_arn                    = var.kms_key_arn
  reserved_concurrent_executions = var.reserved_concurrency

  environment {
    variables = {
      LOG_LEVEL = "INFO"
    }
  }

  tracing_config {
    mode = "Active"
  }

  dead_letter_config {
    target_arn = aws_sqs_queue.dlq.arn
  }

  vpc_config {
    subnet_ids         = var.subnet_ids
    security_group_ids = [aws_security_group.this.id]
  }

  depends_on = [aws_cloudwatch_log_group.this, aws_iam_role_policy.this]
}

resource "aws_lambda_permission" "secrets_manager" {
  statement_id   = "AllowSecretsManagerInvoke"
  action         = "lambda:InvokeFunction"
  function_name  = aws_lambda_function.this.function_name
  principal      = "secretsmanager.amazonaws.com"
  source_arn     = var.secret_arn
  source_account = local.account_id
}
