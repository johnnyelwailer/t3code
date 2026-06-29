variable "location" {
  description = "Azure region for all resources."
  type        = string
  default     = "switzerlandnorth"
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
# PostgreSQL (optional)
# -----------------------------------------------------------------------------
variable "enable_postgresql" {
  description = "When true, provisions Azure Database for PostgreSQL Flexible Server and injects DATABASE_URL into the container app."
  type        = bool
  default     = false
}

variable "postgres_version" {
  description = "PostgreSQL major version."
  type        = string
  default     = "16"
}

variable "postgres_sku_name" {
  description = "Flexible Server SKU name (for example B_Standard_B1ms for low-cost burstable)."
  type        = string
  default     = "B_Standard_B1ms"
}

variable "postgres_storage_mb" {
  description = "Provisioned storage in MB for PostgreSQL Flexible Server."
  type        = number
  default     = 32768
}

variable "postgres_database_name" {
  description = "Application database name created inside PostgreSQL Flexible Server."
  type        = string
  default     = "t3code"
}

variable "postgres_admin_username" {
  description = "PostgreSQL admin username for the flexible server."
  type        = string
  default     = "t3admin"
}

variable "postgres_backup_retention_days" {
  description = "Automated backup retention period in days for PostgreSQL Flexible Server."
  type        = number
  default     = 7
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
# Private networking / hardening
# -----------------------------------------------------------------------------
variable "enable_private_networking" {
  description = "When true, provisions a VNet, integrates Container Apps infrastructure subnet, configures PostgreSQL private access (delegated subnet + private DNS), and creates private endpoints for Key Vault (optional) and Azure Files."
  type        = bool
  default     = false
}

variable "enforce_data_plane_public_network_disable" {
  description = "When true (with enable_private_networking), disables public network access for PostgreSQL and Storage Account data-plane resources. Key Vault public access is controlled separately."
  type        = bool
  default     = false
}

variable "enable_key_vault_private_endpoint" {
  description = "When true (with enable_private_networking), provisions Key Vault private endpoint and private DNS. Keep false when Terraform runners are outside the VNet."
  type        = bool
  default     = false

  validation {
    condition     = var.enable_key_vault_private_endpoint ? var.enable_private_networking : true
    error_message = "enable_key_vault_private_endpoint=true requires enable_private_networking=true."
  }
}

variable "disable_key_vault_public_network_access" {
  description = "When true, disables public network access for Key Vault. Keep false if Terraform/CI must manage secrets from outside private networking."
  type        = bool
  default     = false

  validation {
    condition = var.disable_key_vault_public_network_access ? (
      var.enable_private_networking && var.enable_key_vault_private_endpoint
    ) : true
    error_message = "disable_key_vault_public_network_access=true requires enable_private_networking=true and enable_key_vault_private_endpoint=true."
  }
}

variable "vnet_cidr" {
  description = "Address space for the platform VNet when private networking is enabled."
  type        = string
  default     = "10.70.0.0/16"
}

variable "container_apps_infra_subnet_cidr" {
  description = "CIDR for the delegated Container Apps infrastructure subnet."
  type        = string
  default     = "10.70.0.0/23"
}

variable "private_endpoints_subnet_cidr" {
  description = "CIDR for private endpoints subnet (Key Vault and Storage private endpoints)."
  type        = string
  default     = "10.70.2.0/24"
}

variable "postgres_delegated_subnet_cidr" {
  description = "CIDR for delegated PostgreSQL Flexible Server subnet when private networking is enabled."
  type        = string
  default     = "10.70.3.0/24"
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
