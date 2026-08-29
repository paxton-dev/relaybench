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

variable "demo_domain_name" {
  description = "Optional custom hostname for the CloudFront demo, such as relaybench.jamespaxton.io."
  type        = string
  default     = null
  nullable    = true
}

variable "demo_certificate_arn" {
  description = "Optional ARN of an issued us-east-1 ACM certificate covering demo_domain_name."
  type        = string
  default     = null
  nullable    = true
}

variable "bedrock_model_id" {
  description = "Regional Amazon Bedrock model used for bounded AI diagnoses."
  type        = string
  default     = "amazon.nova-micro-v1:0"

  validation {
    condition     = var.bedrock_model_id == "amazon.nova-micro-v1:0"
    error_message = "RelayBench currently supports the regional Nova Micro model only."
  }
}

variable "ai_monthly_diagnosis_limit" {
  description = "Hard application-level ceiling on new Bedrock diagnoses per UTC month."
  type        = number
  default     = 200

  validation {
    condition     = var.ai_monthly_diagnosis_limit >= 1 && var.ai_monthly_diagnosis_limit <= 1000
    error_message = "AI monthly diagnosis limit must be between 1 and 1000."
  }
}
