# T3 Code on Azure Container Apps

Infrastructure-as-Code to run the T3 Code server (`apps/server`, with the web
client bundled in) on Azure Container Apps as a single stateful replica.

## Architecture

```
GitHub Actions ──(OIDC)──> az acr build ──> Azure Container Registry
                                                     │ (image)
                                                     ▼
        Azure Container Apps Environment  ◄── Log Analytics
                       │
                 Container App (1 replica, ingress :3773 HTTPS+WS)
                  │            │                 │
        /data mount      Key Vault refs     spawns provider CLIs
          │              (via managed id)    (codex/claude/cursor/opencode)
   Azure Files share     provider API keys   in ephemeral /workspace
   (state.sqlite, secrets,
    provider auth dirs)
```

- **Single replica** (`min = max = 1`): the server is stateful (SQLite +
  WebSocket + spawned child processes), so it does not scale horizontally.
- **Persistence**: `T3CODE_HOME=/data` is an Azure Files share. Repos are
  **not** persisted — users clone into the ephemeral `/workspace` per session.
- **Secrets**: provider API keys live in Key Vault and are injected as env vars
  via the app's user-assigned managed identity. Interactive logins
  (`codex login`, etc.) persist on `/data` instead.
- **Access**: public HTTPS ingress, gated by T3's bearer token. Optionally
  restrict with `allowed_ip_cidrs`.

## Prerequisites

- Azure CLI (`az`) logged in to the target subscription.
- Terraform >= 1.9.
- Permissions to create role assignments (Owner or User Access Administrator on
  the subscription/RG), since the stack assigns AcrPull / Key Vault roles.

## 1. Bootstrap remote state (once)

```bash
cd infra/azure/bootstrap
terraform init
terraform apply
terraform output backend_config   # copy values into ../backend.hcl
```

## 2. Deploy the stack

```bash
cd infra/azure
# update backend.hcl with bootstrap output if needed
# terraform.prod.tfvars is committed and non-secret.
# Keep secrets outside git via TF_VAR_provider_secrets or CI.

terraform init -backend-config=backend.hcl
terraform apply -var-file=terraform.prod.tfvars
```

Defaults now target `switzerlandnorth` with PostgreSQL enabled in
`terraform.prod.tfvars`.

Provider keys are sensitive — prefer environment injection over the tfvars file:

```bash
export TF_VAR_provider_secrets='{"OPENAI_API_KEY":"sk-...","ANTHROPIC_API_KEY":"sk-ant-..."}'
terraform apply -var-file=terraform.prod.tfvars
```

The first apply pushes no image; the Container App will fail to pull until CI
publishes one (step 3). You can also seed an image manually:

```bash
az acr build -r "$(terraform output -raw acr_name)" \
  -t t3code-server:latest -f ../../apps/server/Dockerfile ../..
```

## 3. CI/CD

`.github/workflows/deploy-azure.yml` builds in ACR and rolls the app on every
push to `main`. Configure:

- **Secrets**: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`
- **Variables**: `ACR_NAME`, `ACR_LOGIN_SERVER`, `IMAGE_REPOSITORY`
  (`t3code-server`), `AZURE_RESOURCE_GROUP`, `AZURE_CONTAINERAPP_NAME`

Set up an app registration with a federated credential for this repo, and grant
it **AcrPush** on the registry plus **Contributor** on the resource group.

## 4. Connect

```bash
# Print the bearer token / pairing info logged at startup:
az containerapp logs show -n <app> -g <rg> --follow --tail 200

terraform output app_url   # open in a browser, pair with the token
```

## 5. (Optional) Interactive provider login

```bash
az containerapp exec -n <app> -g <rg> --command /bin/bash
# inside the container:
codex login      # or: claude /login, agent login, opencode auth login
```

Credentials are written under `/data` and survive restarts.

## PostgreSQL Cutover Checklist

Use this sequence for production cutover in Switzerland North.

1. Prepare Terraform variables

```bash
cd infra/azure
# confirm: terraform.prod.tfvars has the expected production settings
```

2. Review resource changes before apply

```bash
terraform plan
```

3. Apply infrastructure changes

```bash
terraform apply
```

Use the committed var-file explicitly:

```bash
terraform plan -var-file=terraform.prod.tfvars
terraform apply -var-file=terraform.prod.tfvars
```

4. Verify PostgreSQL provisioning outputs

```bash
terraform output postgresql_fqdn
terraform output postgresql_database_name
```

5. Deploy latest server image

```bash
az acr build -r "$(terraform output -raw acr_name)" \
  -t t3code-server:latest -f ../../apps/server/Dockerfile ../..
```

6. Confirm startup and migrations

```bash
az containerapp logs show -n "$(terraform output -raw container_app_name)" \
  -g "$(terraform output -raw resource_group_name)" --follow --tail 300
```

7. Smoke test

- Open the app URL from `terraform output app_url`
- Pair with the startup token
- Create a thread and send a test turn
- Restart the Container App and confirm session/auth artifacts still persist under `/data`

8. Observe for 24h

- No `database is locked` startup failures
- No migration failures
- Stable websocket session behavior

### Rollback

If cutover fails, set `enable_postgresql = false` in `terraform.prod.tfvars`,
run `terraform apply -var-file=terraform.prod.tfvars`, and redeploy. This
restores SQLite-on-fileshare behavior.

## Hardening

The stack now supports a staged hardening model:

- Keep **Container App ingress public** (HTTPS + token pairing), while
  hardening data-plane resources behind private networking.
- Enable private networking with:
  - `enable_private_networking = true`
  - `enforce_data_plane_public_network_disable = true`
- This provisions VNet/subnets plus private data-plane connectivity for:
  - PostgreSQL Flexible Server via delegated subnet + private DNS
  - Azure Files via private endpoint + private DNS

Key Vault is intentionally configurable for development-phase simplicity:

- Keep it public (recommended default while CI runners are outside the VNet):
  - `enable_key_vault_private_endpoint = false`
  - `disable_key_vault_public_network_access = false`
- Fully private Key Vault (advanced):
  - `enable_key_vault_private_endpoint = true`
  - `disable_key_vault_public_network_access = true`

Recommended rollout (two applies):

1. Set `enable_private_networking = true` and keep
   `enforce_data_plane_public_network_disable = false` for initial validation.
2. Verify startup, migrations, and secrets resolve correctly over private paths
   (PostgreSQL + Storage), and Key Vault access behaves as configured.
3. Set `enforce_data_plane_public_network_disable = true` and apply again to
   disable public data-plane access.

Notes:

- `allowed_ip_cidrs` remains optional; when set, only those CIDRs can reach
  the public app ingress.
- If you choose private-only Key Vault, Terraform applies that manage secrets
  must run from a network path that can reach private endpoints (for example,
  a runner in the same VNet or connected network).
- Future hardening can still add Entra-gated app access (Front Door / ACA auth)
  and non-root runtime once provider CLI permissions are validated.

### Quick Rollout Checklist (External CI Runner Friendly)

Use this sequence when Terraform/CI runs outside the VNet:

1. Confirm `terraform.prod.tfvars` includes:

- `enable_private_networking = true`
- `enforce_data_plane_public_network_disable = true`
- `enable_key_vault_private_endpoint = false`
- `disable_key_vault_public_network_access = false`

2. Review and apply:

```bash
terraform plan -var-file=terraform.prod.tfvars
terraform apply -var-file=terraform.prod.tfvars
```

3. Verify hardening outputs:

```bash
terraform output private_networking_enabled
terraform output data_plane_public_network_disabled
terraform output key_vault_private_endpoint_enabled
terraform output key_vault_public_network_disabled
```

4. Verify app health and migrations:

```bash
az containerapp logs show -n "$(terraform output -raw container_app_name)" \
  -g "$(terraform output -raw resource_group_name)" --follow --tail 300
```

5. Confirm app remains publicly reachable and pair with token:

- `terraform output app_url`

Optional later step (private-only Key Vault):

1. Move Terraform runner into reachable private network.
2. Set:

- `enable_key_vault_private_endpoint = true`
- `disable_key_vault_public_network_access = true`

3. Re-apply and re-verify secret resolution.
