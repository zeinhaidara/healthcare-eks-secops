# Same bucket as the main root, separate state key. Bucket and region come from -backend-config.
terraform {
  backend "s3" {
    key          = "cluster-addons/terraform.tfstate"
    encrypt      = true
    use_lockfile = true
  }
}
