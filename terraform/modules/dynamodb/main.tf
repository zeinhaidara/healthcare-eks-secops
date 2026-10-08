resource "aws_dynamodb_table" "this" {
  name         = var.name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = var.hash_key

  attribute {
    name = var.hash_key
    type = "S"
  }

  server_side_encryption {
    enabled     = true
    kms_key_arn = var.kms_key_arn
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    DataClassification = var.data_classification
  }
}

# Seed data (synthetic) comes from the same file the app uses for local runs, so the table and
# local dev always match. The app never writes; this is the only writer.
locals {
  seed_file  = "${path.module}/../../../app/data/patients.json"
  seed_items = { for item in jsondecode(file(local.seed_file)) : item[var.hash_key] => item }
}

resource "aws_dynamodb_table_item" "seed" {
  for_each = local.seed_items

  table_name = aws_dynamodb_table.this.name
  hash_key   = aws_dynamodb_table.this.hash_key
  # The record body is marked sensitive so plan/apply output and plan.txt show "(sensitive value)".
  # The key stays visible in the resource address: seed["P001"]. sensitive() only marks the value
  # inside Terraform; the JSON sent to DynamoDB is unchanged.
  item = sensitive(jsonencode({
    for k, v in each.value : k => contains(var.number_attributes, k) ? { N = tostring(v) } : { S = tostring(v) }
  }))

  lifecycle {
    ignore_changes = []
  }
}
