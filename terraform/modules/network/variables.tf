variable "name" {
  type = string
}

variable "vpc_cidr" {
  type = string
}

variable "availability_zones" {
  description = "Explicit AZ names; one public and one private subnet per AZ."
  type        = list(string)
}

variable "subnet_newbits" {
  description = "Bits added to the VPC prefix for each subnet (/16 + 8 = /24)."
  type        = number
  default     = 8
}

variable "public_offset" {
  description = "First subnet index for public subnets (10.x.1.0/24, 10.x.2.0/24)."
  type        = number
  default     = 1
}

variable "private_offset" {
  description = "First subnet index for private subnets (10.x.11.0/24, 10.x.12.0/24)."
  type        = number
  default     = 11
}

variable "cluster_name" {
  description = "EKS cluster name, used for subnet discovery tags."
  type        = string
}

variable "kms_key_arn" {
  description = "Key that encrypts the flow log group."
  type        = string
}

variable "log_retention_days" {
  type    = number
  default = 30
}
