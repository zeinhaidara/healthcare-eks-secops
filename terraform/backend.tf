# Partial backend. The bucket and region are never hardcoded; the workflow passes them:
#   terraform init -backend-config="bucket=$TF_STATE_BUCKET" -backend-config="region=$AWS_REGION"
terraform {
  backend "s3" {
    key          = "main/terraform.tfstate"
    encrypt      = true
    use_lockfile = true
  }
}
