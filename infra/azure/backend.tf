terraform {
  # Remote state in Azure Storage. Values are supplied via `-backend-config`
  # (see infra/azure/README.md) or a backend.hcl file so secrets/names stay out
  # of version control. Provision the backend first with infra/azure/bootstrap.
  #
  #   terraform init -backend-config=backend.hcl
  #
  backend "azurerm" {
    # resource_group_name  = "rg-t3code-tfstate"
    # storage_account_name = "t3codetfstate"
    # container_name       = "tfstate"
    # key                  = "t3code-aca.tfstate"
    use_azuread_auth = true
  }
}
