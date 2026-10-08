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
  item = jsonencode({
    for k, v in each.value : k => contains(var.number_attributes, k) ? { N = tostring(v) } : { S = tostring(v) }
  })

  lifecycle {
    ignore_changes = []
  }
}
