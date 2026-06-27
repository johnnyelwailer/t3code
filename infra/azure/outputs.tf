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
