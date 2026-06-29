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
  base_name                          = "${var.name_prefix}-${var.environment}"
  suffix                             = random_string.suffix.result
  private_networking_enabled         = var.enable_private_networking
  data_plane_lockdown_enabled        = var.enable_private_networking && var.enforce_data_plane_public_network_disable
  key_vault_private_endpoint_enabled = local.private_networking_enabled && var.enable_key_vault_private_endpoint
  key_vault_public_network_disabled  = local.private_networking_enabled && var.enforce_data_plane_public_network_disable && var.disable_key_vault_public_network_access

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
  public_network_access_enabled = local.data_plane_lockdown_enabled ? false : true
  delegated_subnet_id           = local.private_networking_enabled && var.enable_postgresql ? azurerm_subnet.postgres_delegated[0].id : null
  private_dns_zone_id           = local.private_networking_enabled && var.enable_postgresql ? azurerm_private_dns_zone.postgres[0].id : null

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

  depends_on = [
    azurerm_private_dns_zone_virtual_network_link.postgres,
  ]
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
  count = var.enable_postgresql && !local.data_plane_lockdown_enabled ? 1 : 0

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
# Private networking (optional)
# -----------------------------------------------------------------------------
resource "azurerm_virtual_network" "main" {
  count = local.private_networking_enabled ? 1 : 0

  name                = "vnet-${local.base_name}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  address_space       = [var.vnet_cidr]
  tags                = var.tags
}

resource "azurerm_subnet" "container_apps_infra" {
  count = local.private_networking_enabled ? 1 : 0

  name                 = "snet-${local.base_name}-aca"
  resource_group_name  = azurerm_resource_group.main.name
  virtual_network_name = azurerm_virtual_network.main[0].name
  address_prefixes     = [var.container_apps_infra_subnet_cidr]

  delegation {
    name = "containerapps"
    service_delegation {
      name = "Microsoft.App/environments"
    }
  }
}

resource "azurerm_subnet" "private_endpoints" {
  count = local.private_networking_enabled ? 1 : 0

  name                              = "snet-${local.base_name}-private-endpoints"
  resource_group_name               = azurerm_resource_group.main.name
  virtual_network_name              = azurerm_virtual_network.main[0].name
  address_prefixes                  = [var.private_endpoints_subnet_cidr]
  private_endpoint_network_policies = "Disabled"
}

resource "azurerm_subnet" "postgres_delegated" {
  count = local.private_networking_enabled && var.enable_postgresql ? 1 : 0

  name                 = "snet-${local.base_name}-postgres"
  resource_group_name  = azurerm_resource_group.main.name
  virtual_network_name = azurerm_virtual_network.main[0].name
  address_prefixes     = [var.postgres_delegated_subnet_cidr]

  delegation {
    name = "postgres-flex"
    service_delegation {
      name = "Microsoft.DBforPostgreSQL/flexibleServers"
      actions = [
        "Microsoft.Network/virtualNetworks/subnets/join/action",
      ]
    }
  }
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
  public_network_access_enabled = local.data_plane_lockdown_enabled ? false : true
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
  name                          = local.kv_name
  resource_group_name           = azurerm_resource_group.main.name
  location                      = azurerm_resource_group.main.location
  tenant_id                     = data.azurerm_client_config.current.tenant_id
  sku_name                      = "standard"
  rbac_authorization_enabled    = true
  purge_protection_enabled      = false
  soft_delete_retention_days    = 7
  public_network_access_enabled = local.key_vault_public_network_disabled ? false : true

  network_acls {
    default_action = local.key_vault_public_network_disabled ? "Deny" : "Allow"
    bypass         = "AzureServices"
  }
  tags = var.tags
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
# Private endpoints + private DNS zones (optional)
# -----------------------------------------------------------------------------
resource "azurerm_private_dns_zone" "postgres" {
  count = local.private_networking_enabled && var.enable_postgresql ? 1 : 0

  name                = "privatelink.postgres.database.azure.com"
  resource_group_name = azurerm_resource_group.main.name
  tags                = var.tags
}

resource "azurerm_private_dns_zone_virtual_network_link" "postgres" {
  count = local.private_networking_enabled && var.enable_postgresql ? 1 : 0

  name                  = "pdnslink-${local.base_name}-postgres"
  resource_group_name   = azurerm_resource_group.main.name
  private_dns_zone_name = azurerm_private_dns_zone.postgres[0].name
  virtual_network_id    = azurerm_virtual_network.main[0].id
  registration_enabled  = false
  tags                  = var.tags
}

resource "azurerm_private_dns_zone" "key_vault" {
  count = local.key_vault_private_endpoint_enabled ? 1 : 0

  name                = "privatelink.vaultcore.azure.net"
  resource_group_name = azurerm_resource_group.main.name
  tags                = var.tags
}

resource "azurerm_private_dns_zone_virtual_network_link" "key_vault" {
  count = local.key_vault_private_endpoint_enabled ? 1 : 0

  name                  = "pdnslink-${local.base_name}-keyvault"
  resource_group_name   = azurerm_resource_group.main.name
  private_dns_zone_name = azurerm_private_dns_zone.key_vault[0].name
  virtual_network_id    = azurerm_virtual_network.main[0].id
  registration_enabled  = false
  tags                  = var.tags
}

resource "azurerm_private_dns_zone" "storage_file" {
  count = local.private_networking_enabled ? 1 : 0

  name                = "privatelink.file.core.windows.net"
  resource_group_name = azurerm_resource_group.main.name
  tags                = var.tags
}

resource "azurerm_private_dns_zone_virtual_network_link" "storage_file" {
  count = local.private_networking_enabled ? 1 : 0

  name                  = "pdnslink-${local.base_name}-storage-file"
  resource_group_name   = azurerm_resource_group.main.name
  private_dns_zone_name = azurerm_private_dns_zone.storage_file[0].name
  virtual_network_id    = azurerm_virtual_network.main[0].id
  registration_enabled  = false
  tags                  = var.tags
}

resource "azurerm_private_endpoint" "key_vault" {
  count = local.key_vault_private_endpoint_enabled ? 1 : 0

  name                = "pep-${local.base_name}-keyvault"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  subnet_id           = azurerm_subnet.private_endpoints[0].id
  tags                = var.tags

  private_service_connection {
    name                           = "psc-${local.base_name}-keyvault"
    private_connection_resource_id = azurerm_key_vault.main.id
    subresource_names              = ["vault"]
    is_manual_connection           = false
  }

  private_dns_zone_group {
    name                 = "pdnszg-keyvault"
    private_dns_zone_ids = [azurerm_private_dns_zone.key_vault[0].id]
  }
}

resource "azurerm_private_endpoint" "storage_file" {
  count = local.private_networking_enabled ? 1 : 0

  name                = "pep-${local.base_name}-storage-file"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  subnet_id           = azurerm_subnet.private_endpoints[0].id
  tags                = var.tags

  private_service_connection {
    name                           = "psc-${local.base_name}-storage-file"
    private_connection_resource_id = azurerm_storage_account.main.id
    subresource_names              = ["file"]
    is_manual_connection           = false
  }

  private_dns_zone_group {
    name                 = "pdnszg-storage-file"
    private_dns_zone_ids = [azurerm_private_dns_zone.storage_file[0].id]
  }
}

# -----------------------------------------------------------------------------
# Container Apps Environment + persistent storage mount
# -----------------------------------------------------------------------------
resource "azurerm_container_app_environment" "main" {
  name                       = "cae-${local.base_name}"
  resource_group_name        = azurerm_resource_group.main.name
  location                   = azurerm_resource_group.main.location
  log_analytics_workspace_id = azurerm_log_analytics_workspace.main.id
  infrastructure_subnet_id   = local.private_networking_enabled ? azurerm_subnet.container_apps_infra[0].id : null
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
