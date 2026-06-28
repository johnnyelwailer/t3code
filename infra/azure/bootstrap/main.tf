terraform {
  required_version = ">= 1.9.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.20"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

provider "azurerm" {
  features {}
  storage_use_azuread = true
}

variable "location" {
  description = "Azure region for the Terraform state storage."
  type        = string
  default     = "switzerlandnorth"
}

variable "name_prefix" {
  description = "Prefix for the state resources."
  type        = string
  default     = "t3code"
}

variable "storage_account_name" {
  description = "Pre-chosen storage account name for Terraform state (3-24 lowercase letters/digits). Leave empty to keep legacy random suffix behavior."
  type        = string
  default     = ""

  validation {
    condition     = var.storage_account_name == "" || can(regex("^[a-z0-9]{3,24}$", var.storage_account_name))
    error_message = "storage_account_name must be empty or 3-24 lowercase letters/digits."
  }
}

resource "random_string" "suffix" {
  count   = var.storage_account_name == "" ? 1 : 0
  length  = 6
  upper   = false
  special = false
}

locals {
  tfstate_storage_account_name = var.storage_account_name != "" ? var.storage_account_name : substr("${var.name_prefix}tfstate${random_string.suffix[0].result}", 0, 24)
}

resource "azurerm_resource_group" "tfstate" {
  name     = "rg-${var.name_prefix}-tfstate"
  location = var.location

  lifecycle {
    prevent_destroy = true
  }
}

resource "azurerm_storage_account" "tfstate" {
  name                            = local.tfstate_storage_account_name
  resource_group_name             = azurerm_resource_group.tfstate.name
  location                        = azurerm_resource_group.tfstate.location
  account_tier                    = "Standard"
  account_replication_type        = "LRS"
  min_tls_version                 = "TLS1_2"
  allow_nested_items_to_be_public = false
  shared_access_key_enabled       = false

  lifecycle {
    prevent_destroy = true
  }
}

resource "azurerm_storage_container" "tfstate" {
  name                  = "tfstate"
  storage_account_id    = azurerm_storage_account.tfstate.id
  container_access_type = "private"
}

output "backend_config" {
  description = "Values for the root stack's backend.hcl."
  value = {
    resource_group_name  = azurerm_resource_group.tfstate.name
    storage_account_name = azurerm_storage_account.tfstate.name
    container_name       = azurerm_storage_container.tfstate.name
    key                  = "t3code-aca.tfstate"
  }
}
