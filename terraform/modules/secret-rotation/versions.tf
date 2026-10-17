# Same constraints as the calling root (terraform/providers.tf), so the lock file does not change.
terraform {
  required_version = ">= 1.10"

  required_providers {
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.7"
    }
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.68"
    }
  }
}
