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
  features {
    key_vault {
      # Permanently purge secrets on destroy so re-applies don't collide with
      # soft-deleted names. Disable if you require recovery windows.
      purge_soft_delete_on_destroy = true
    }
  }
}
