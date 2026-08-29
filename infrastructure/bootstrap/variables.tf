variable "aws_region" {
  description = "AWS region for the Terraform state bucket."
  type        = string
  default     = "us-east-1"
}

variable "github_owner" {
  description = "GitHub account that owns the RelayBench repository."
  type        = string
  default     = "paxton-dev"
}

variable "github_repository_name" {
  description = "GitHub repository allowed to deploy RelayBench."
  type        = string
  default     = "relaybench"
}

variable "github_environment" {
  description = "GitHub environment allowed to assume the production deployment role."
  type        = string
  default     = "production"
}

variable "github_oidc_provider_arn" {
  description = "Existing GitHub Actions OIDC provider ARN, or null to create one."
  type        = string
  default     = null
  nullable    = true
}

locals {
  github_repository = "${var.github_owner}/${var.github_repository_name}"
}
