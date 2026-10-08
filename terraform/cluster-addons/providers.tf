# Second root (D2b): in-cluster resources, planned and applied only by the apply role behind the
# infra approval (terraform-apply.yml jobs addons-plan and addons-apply). The plan role has no
# cluster access.
terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.68"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 3.3"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 3.3"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project   = var.project_name
      Owner     = var.owner
      ManagedBy = "terraform"
    }
  }
}

data "aws_eks_cluster" "this" {
  name = var.cluster_name
}

# Tokens come from `aws eks get-token` at run time, so none is stored in state or the plan file.
locals {
  cluster_host = data.aws_eks_cluster.this.endpoint
  cluster_ca   = base64decode(data.aws_eks_cluster.this.certificate_authority[0].data)
  token_args   = ["eks", "get-token", "--cluster-name", var.cluster_name, "--region", var.aws_region]
}

provider "kubernetes" {
  host                   = local.cluster_host
  cluster_ca_certificate = local.cluster_ca

  exec {
    api_version = "client.authentication.k8s.io/v1beta1"
    command     = "aws"
    args        = local.token_args
  }
}

provider "helm" {
  kubernetes = {
    host                   = local.cluster_host
    cluster_ca_certificate = local.cluster_ca
    exec = {
      api_version = "client.authentication.k8s.io/v1beta1"
      command     = "aws"
      args        = local.token_args
    }
  }
}
