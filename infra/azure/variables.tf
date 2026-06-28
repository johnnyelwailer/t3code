variable "location" {
  description = "Azure region for all resources."
  type        = string
  default     = "westeurope"
}

variable "name_prefix" {
  description = "Short prefix for resource names (lowercase letters/digits)."
  type        = string
  default     = "t3code"

  validation {
    condition     = can(regex("^[a-z][a-z0-9]{1,10}$", var.name_prefix))
    error_message = "name_prefix must be 2-11 chars, lowercase letters/digits, starting with a letter."
  }
}

variable "environment" {
  description = "Deployment environment label (e.g. prod, staging)."
  type        = string
  default     = "prod"
}

variable "tags" {
  description = "Tags applied to all resources."
  type        = map(string)
  default = {
    application = "t3code"
    managed_by  = "terraform"
  }
}

# -----------------------------------------------------------------------------
# Container image
# -----------------------------------------------------------------------------
variable "image_repository" {
  description = "Image repository name within the ACR (without registry host)."
  type        = string
  default     = "t3code-server"
}

variable "image_tag" {
  description = "Image tag to deploy. Set by CI to the git SHA; defaults to latest."
  type        = string
  default     = "latest"
}

# -----------------------------------------------------------------------------
# Compute / scaling
# -----------------------------------------------------------------------------
variable "cpu" {
  description = "vCPU allocated to the container. Stateful app runs a single replica."
  type        = number
  default     = 1.0
}

variable "memory" {
  description = "Memory allocated to the container (e.g. 2Gi). Must pair with cpu per ACA rules."
  type        = string
  default     = "2Gi"
}

# -----------------------------------------------------------------------------
# Persistent state (Azure Files)
# -----------------------------------------------------------------------------
variable "file_share_quota_gb" {
  description = "Quota for the persistent Azure Files share mounted at /data."
  type        = number
  default     = 100
}

variable "storage_account_tier" {
  description = "Storage account tier. Premium (FileStorage) is recommended for SQLite/WAL reliability."
  type        = string
  default     = "Premium"

  validation {
    condition     = contains(["Standard", "Premium"], var.storage_account_tier)
    error_message = "storage_account_tier must be Standard or Premium."
  }
}

# -----------------------------------------------------------------------------
# Provider credentials -> Key Vault -> container env vars
#
# Map of ENV_VAR_NAME => secret value. Each entry is stored as a Key Vault
# secret and injected into the container as a secret-backed environment
# variable. Example:
#   provider_secrets = {
#     OPENAI_API_KEY    = "sk-..."
#     ANTHROPIC_API_KEY = "sk-ant-..."
#   }
# Prefer setting these via TF_VAR_provider_secrets or a tfvars file excluded
# from VCS. Leave empty to authenticate providers interactively instead
# (az containerapp exec -> `codex login`, etc.), persisted on the /data volume.
# -----------------------------------------------------------------------------
variable "provider_secrets" {
  description = "Map of environment variable name to secret value for provider API keys."
  type        = map(string)
  default     = {}
  sensitive   = true
}

# -----------------------------------------------------------------------------
# Ingress / access control
# -----------------------------------------------------------------------------
variable "allowed_ip_cidrs" {
  description = "Optional allowlist of CIDR ranges permitted to reach the public ingress. Empty = open to all (relies on T3 bearer token)."
  type        = list(string)
  default     = []
}

# -----------------------------------------------------------------------------
# Observability (optional OTLP export)
# -----------------------------------------------------------------------------
variable "otlp_traces_url" {
  description = "Optional OTLP traces endpoint (T3CODE_OTLP_TRACES_URL)."
  type        = string
  default     = ""
}

variable "otlp_metrics_url" {
  description = "Optional OTLP metrics endpoint (T3CODE_OTLP_METRICS_URL)."
  type        = string
  default     = ""
}

variable "log_level" {
  description = "T3CODE_LOG_LEVEL value."
  type        = string
  default     = "Info"
}
