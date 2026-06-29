output "app_url" {
  description = "Public HTTPS URL of the T3 Code server."
  value       = "https://${azurerm_container_app.main.ingress[0].fqdn}"
}

output "app_fqdn" {
  description = "Ingress FQDN of the Container App."
  value       = azurerm_container_app.main.ingress[0].fqdn
}

output "acr_login_server" {
  description = "ACR login server (push target for CI)."
  value       = azurerm_container_registry.main.login_server
}

output "acr_name" {
  description = "ACR resource name."
  value       = azurerm_container_registry.main.name
}

output "resource_group_name" {
  description = "Resource group containing all resources."
  value       = azurerm_resource_group.main.name
}

output "container_app_name" {
  description = "Container App name (for az containerapp logs/exec/update)."
  value       = azurerm_container_app.main.name
}

output "key_vault_name" {
  description = "Key Vault name holding provider secrets."
  value       = azurerm_key_vault.main.name
}

output "managed_identity_client_id" {
  description = "Client ID of the app's user-assigned managed identity."
  value       = azurerm_user_assigned_identity.app.client_id
}

output "logs_command" {
  description = "Command to stream container logs (includes the bearer token printed at startup)."
  value       = "az containerapp logs show -n ${azurerm_container_app.main.name} -g ${azurerm_resource_group.main.name} --follow --tail 200"
}

output "postgresql_fqdn" {
  description = "PostgreSQL server FQDN when enable_postgresql=true."
  value       = var.enable_postgresql ? azurerm_postgresql_flexible_server.main[0].fqdn : null
}

output "postgresql_database_name" {
  description = "Application PostgreSQL database name when enable_postgresql=true."
  value       = var.enable_postgresql ? azurerm_postgresql_flexible_server_database.app[0].name : null
}

output "private_networking_enabled" {
  description = "Whether private networking resources are enabled in this deployment."
  value       = var.enable_private_networking
}

output "data_plane_public_network_disabled" {
  description = "Whether public network access is disabled for PostgreSQL and Storage Account data-plane resources."
  value       = var.enable_private_networking && var.enforce_data_plane_public_network_disable
}

output "virtual_network_name" {
  description = "VNet name when private networking is enabled."
  value       = var.enable_private_networking ? azurerm_virtual_network.main[0].name : null
}

output "key_vault_private_endpoint_enabled" {
  description = "Whether Key Vault private endpoint resources are enabled."
  value       = var.enable_private_networking && var.enable_key_vault_private_endpoint
}

output "key_vault_public_network_disabled" {
  description = "Whether Key Vault public network access is disabled."
  value       = var.enable_private_networking && var.enforce_data_plane_public_network_disable && var.disable_key_vault_public_network_access
}
