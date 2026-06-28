data "azurerm_client_config" "current" {}

resource "random_string" "suffix" {
  length  = 6
  upper   = false
  special = false
}

resource "random_password" "postgres_admin" {
  count   = var.enable_postgresql ? 1 : 0
  length  = 24
  special = true
}

locals {
  base_name = "${var.name_prefix}-${var.environment}"
  suffix    = random_string.suffix.result

  # Globally-unique names with no separators (storage/acr/kv constraints).
  acr_name     = substr("${var.name_prefix}${var.environment}acr${local.suffix}", 0, 50)
  storage_name = substr("${var.name_prefix}${var.environment}st${local.suffix}", 0, 24)
  kv_name      = substr("${var.name_prefix}-${var.environment}-kv-${local.suffix}", 0, 24)
  pg_name      = substr("${var.name_prefix}-${var.environment}-pg-${local.suffix}", 0, 63)

  is_premium_storage = var.storage_account_tier == "Premium"

  # Provider env var names are not sensitive (only their values are); declassify
  # the key set so it can drive for_each / dynamic blocks.
  provider_secret_keys = nonsensitive(toset(keys(var.provider_secrets)))

  # Map each provider env var to a Key Vault- and Container App-safe secret name.
  provider_secret_names = {
    for env_name in local.provider_secret_keys :
    env_name => lower(replace(env_name, "_", "-"))
  }

  # Optional OTLP env vars, only emitted when a value is provided.
  otlp_env = merge(
    var.otlp_traces_url == "" ? {} : { T3CODE_OTLP_TRACES_URL = var.otlp_traces_url },
    var.otlp_metrics_url == "" ? {} : { T3CODE_OTLP_METRICS_URL = var.otlp_metrics_url },
  )
}

resource "azurerm_postgresql_flexible_server" "main" {
  count = var.enable_postgresql ? 1 : 0

  name                          = local.pg_name
  resource_group_name           = azurerm_resource_group.main.name
  location                      = azurerm_resource_group.main.location
  version                       = var.postgres_version
  administrator_login           = var.postgres_admin_username
  administrator_password        = random_password.postgres_admin[0].result
  sku_name                      = var.postgres_sku_name
  storage_mb                    = var.postgres_storage_mb
  backup_retention_days         = var.postgres_backup_retention_days
  public_network_access_enabled = true

  lifecycle {
    # Imported servers may have an assigned zone that Azure disallows changing
    # in-place without specific HA choreography. Keep this rollout focused on
    # app cutover and ignore zone drift.
    ignore_changes = [
      zone,
      administrator_password,
    ]
  }

  tags = var.tags
}

resource "azurerm_postgresql_flexible_server_database" "app" {
  count = var.enable_postgresql ? 1 : 0

  name      = var.postgres_database_name
  server_id = azurerm_postgresql_flexible_server.main[0].id
  charset   = "UTF8"
  collation = "en_US.utf8"
}

# Allows Azure-hosted workloads (including Container Apps) to reach the DB over
# public networking while we keep the initial deployment simple.
resource "azurerm_postgresql_flexible_server_firewall_rule" "allow_azure_services" {
  count = var.enable_postgresql ? 1 : 0

  name             = "allow-azure-services"
  server_id        = azurerm_postgresql_flexible_server.main[0].id
  start_ip_address = "0.0.0.0"
  end_ip_address   = "0.0.0.0"
}

# -----------------------------------------------------------------------------
# Resource group
# -----------------------------------------------------------------------------
resource "azurerm_resource_group" "main" {
  name     = "rg-${local.base_name}"
  location = var.location
  tags     = var.tags
}

# -----------------------------------------------------------------------------
# Identity (used for ACR pull + Key Vault access)
# -----------------------------------------------------------------------------
resource "azurerm_user_assigned_identity" "app" {
  name                = "id-${local.base_name}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  tags                = var.tags
}

# -----------------------------------------------------------------------------
# Container Registry
# -----------------------------------------------------------------------------
resource "azurerm_container_registry" "main" {
  name                = local.acr_name
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  sku                 = "Standard"
  admin_enabled       = false
  tags                = var.tags
}

resource "azurerm_role_assignment" "acr_pull" {
  scope                = azurerm_container_registry.main.id
  role_definition_name = "AcrPull"
  principal_id         = azurerm_user_assigned_identity.app.principal_id
}

# -----------------------------------------------------------------------------
# Observability
# -----------------------------------------------------------------------------
resource "azurerm_log_analytics_workspace" "main" {
  name                = "log-${local.base_name}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  sku                 = "PerGB2018"
  retention_in_days   = 30
  tags                = var.tags
}

# -----------------------------------------------------------------------------
# Persistent state: Storage Account + Azure Files share
#
# NOTE: SQLite (WAL mode) over Azure Files SMB can hit fsync/locking edge cases.
# The single-replica deployment avoids multi-writer contention, and the Premium
# (FileStorage) tier improves consistency. For maximum reliability, migrate to
# an NFS share behind a private endpoint (see README "Hardening").
# -----------------------------------------------------------------------------
resource "azurerm_storage_account" "main" {
  name                          = local.storage_name
  resource_group_name           = azurerm_resource_group.main.name
  location                      = azurerm_resource_group.main.location
  account_tier                  = var.storage_account_tier
  account_kind                  = local.is_premium_storage ? "FileStorage" : "StorageV2"
  account_replication_type      = "LRS"
  min_tls_version               = "TLS1_2"
  public_network_access_enabled = true
  tags                          = var.tags
}

resource "azurerm_storage_share" "data" {
  name               = "t3code-data"
  storage_account_id = azurerm_storage_account.main.id
  quota              = var.file_share_quota_gb
}

# -----------------------------------------------------------------------------
# Key Vault (RBAC) + provider secrets
# -----------------------------------------------------------------------------
resource "azurerm_key_vault" "main" {
  name                       = local.kv_name
  resource_group_name        = azurerm_resource_group.main.name
  location                   = azurerm_resource_group.main.location
  tenant_id                  = data.azurerm_client_config.current.tenant_id
  sku_name                   = "standard"
  rbac_authorization_enabled = true
  purge_protection_enabled   = false
  soft_delete_retention_days = 7
  tags                       = var.tags
}

# The principal running Terraform needs data-plane rights to create secrets.
resource "azurerm_role_assignment" "kv_deployer" {
  scope                = azurerm_key_vault.main.id
  role_definition_name = "Key Vault Secrets Officer"
  principal_id         = data.azurerm_client_config.current.object_id
}

# The container's managed identity needs read access to the secrets.
resource "azurerm_role_assignment" "kv_app_reader" {
  scope                = azurerm_key_vault.main.id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azurerm_user_assigned_identity.app.principal_id
}

resource "azurerm_key_vault_secret" "provider" {
  for_each     = local.provider_secret_keys
  name         = local.provider_secret_names[each.key]
  value        = var.provider_secrets[each.key]
  key_vault_id = azurerm_key_vault.main.id

  # Wait for the deployer role assignment to propagate before writing secrets.
  depends_on = [azurerm_role_assignment.kv_deployer]
}

resource "azurerm_key_vault_secret" "database_url" {
  count = var.enable_postgresql ? 1 : 0

  name  = "database-url"
  value = "postgresql://${urlencode(var.postgres_admin_username)}:${urlencode(random_password.postgres_admin[0].result)}@${azurerm_postgresql_flexible_server.main[0].fqdn}:5432/${urlencode(var.postgres_database_name)}?sslmode=require"

  key_vault_id = azurerm_key_vault.main.id
  depends_on   = [azurerm_role_assignment.kv_deployer]
}

# -----------------------------------------------------------------------------
# Container Apps Environment + persistent storage mount
# -----------------------------------------------------------------------------
resource "azurerm_container_app_environment" "main" {
  name                       = "cae-${local.base_name}"
  resource_group_name        = azurerm_resource_group.main.name
  location                   = azurerm_resource_group.main.location
  log_analytics_workspace_id = azurerm_log_analytics_workspace.main.id
  tags                       = var.tags
}

resource "azurerm_container_app_environment_storage" "data" {
  name                         = "t3code-data"
  container_app_environment_id = azurerm_container_app_environment.main.id
  account_name                 = azurerm_storage_account.main.name
  share_name                   = azurerm_storage_share.data.name
  access_key                   = azurerm_storage_account.main.primary_access_key
  access_mode                  = "ReadWrite"
}

# -----------------------------------------------------------------------------
# Container App (single stateful replica)
# -----------------------------------------------------------------------------
resource "azurerm_container_app" "main" {
  name                         = "ca-${local.base_name}"
  resource_group_name          = azurerm_resource_group.main.name
  container_app_environment_id = azurerm_container_app_environment.main.id
  revision_mode                = "Single"
  tags                         = var.tags

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.app.id]
  }

  registry {
    server   = azurerm_container_registry.main.login_server
    identity = azurerm_user_assigned_identity.app.id
  }

  # Provider API keys surfaced from Key Vault via the managed identity.
  dynamic "secret" {
    for_each = local.provider_secret_keys
    content {
      name                = local.provider_secret_names[secret.value]
      key_vault_secret_id = azurerm_key_vault_secret.provider[secret.value].versionless_id
      identity            = azurerm_user_assigned_identity.app.id
    }
  }

  dynamic "secret" {
    for_each = var.enable_postgresql ? [1] : []
    content {
      name                = "database-url"
      key_vault_secret_id = azurerm_key_vault_secret.database_url[0].versionless_id
      identity            = azurerm_user_assigned_identity.app.id
    }
  }

  template {
    # Stateful: SQLite + WebSocket + spawned child processes. Exactly one replica.
    min_replicas = 1
    max_replicas = 1

    volume {
      name         = "data"
      storage_type = "AzureFile"
      storage_name = azurerm_container_app_environment_storage.data.name
    }

    container {
      name   = "t3code-server"
      image  = "${azurerm_container_registry.main.login_server}/${var.image_repository}:${var.image_tag}"
      cpu    = var.cpu
      memory = var.memory

      volume_mounts {
        name = "data"
        path = "/data"
      }

      env {
        name  = "T3CODE_HOST"
        value = "0.0.0.0"
      }
      env {
        name  = "T3CODE_PORT"
        value = "3773"
      }
      env {
        name  = "T3CODE_HOME"
        value = "/data"
      }
      dynamic "env" {
        for_each = var.enable_postgresql ? [1] : []
        content {
          name        = "DATABASE_URL"
          secret_name = "database-url"
        }
      }
      # SQLite WAL relies on shared-memory mmap that Azure Files SMB does not
      # support (surfaces as "database is locked"). Keep this override only
      # while SQLite remains the active database backend.
      dynamic "env" {
        for_each = var.enable_postgresql ? [] : [1]
        content {
          name  = "T3CODE_SQLITE_JOURNAL_MODE"
          value = "DELETE"
        }
      }
      env {
        name  = "T3CODE_NO_BROWSER"
        value = "true"
      }
      env {
        name  = "T3CODE_MODE"
        value = "web"
      }
      env {
        name  = "T3CODE_LOG_LEVEL"
        value = var.log_level
      }

      # Optional OTLP endpoints.
      dynamic "env" {
        for_each = local.otlp_env
        content {
          name  = env.key
          value = env.value
        }
      }

      # Provider API keys (secret-backed env vars).
      dynamic "env" {
        for_each = local.provider_secret_keys
        content {
          name        = env.value
          secret_name = local.provider_secret_names[env.value]
        }
      }

      startup_probe {
        transport = "TCP"
        port      = 3773
      }

      liveness_probe {
        transport = "TCP"
        port      = 3773
      }
    }
  }

  ingress {
    external_enabled           = true
    target_port                = 3773
    transport                  = "auto"
    allow_insecure_connections = false

    traffic_weight {
      latest_revision = true
      percentage      = 100
    }

    # Optional IP allowlist. When any Allow rule exists, all other IPs are denied.
    dynamic "ip_security_restriction" {
      for_each = var.allowed_ip_cidrs
      content {
        name             = "allow-${ip_security_restriction.key}"
        ip_address_range = ip_security_restriction.value
        action           = "Allow"
      }
    }
  }

  depends_on = [
    azurerm_role_assignment.acr_pull,
    azurerm_role_assignment.kv_app_reader,
  ]
}
