variable "aws_region" {
  description = "AWS region for regional RelayBench resources."
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Deployment environment name."
  type        = string
  default     = "development"

  validation {
    condition     = contains(["development", "production"], var.environment)
    error_message = "Environment must be development or production."
  }
}

variable "allowed_origins" {
  description = "Additional browser origins allowed to call the public read API."
  type        = list(string)
  default     = []
}
