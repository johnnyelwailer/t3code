# Committed, non-secret production baseline.
# Keep secrets out of this file (use TF_VAR_provider_secrets or CI secret store).

location    = "switzerlandnorth"
name_prefix = "t3code"
environment = "prod"

# Image to deploy. CI should override image_tag with the git SHA.
image_repository = "t3code-server"
image_tag        = "latest"

# Compute (single stateful replica).
cpu    = 1.0
memory = "2Gi"

# Persistent filesystem state for T3 home (auth/session artifacts, logs).
# Relational data is stored in PostgreSQL.
storage_account_tier = "Standard"
file_share_quota_gb  = 20

# PostgreSQL production baseline (low-cost single-zone profile).
enable_postgresql              = true
postgres_version               = "16"
postgres_sku_name              = "B_Standard_B1ms"
postgres_storage_mb            = 32768
postgres_database_name         = "t3code"
postgres_admin_username        = "t3admin"
postgres_backup_retention_days = 7

# Optional: restrict public ingress to known CIDR ranges.
# allowed_ip_cidrs = ["203.0.113.0/24"]

# Optional OTLP export.
# otlp_traces_url  = "https://otlp.example.com/v1/traces"
# otlp_metrics_url = "https://otlp.example.com/v1/metrics"

log_level = "Info"
