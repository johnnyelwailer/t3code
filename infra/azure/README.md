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
cp terraform.tfvars.example terraform.tfvars   # adjust region/names/secrets

terraform init -backend-config=backend.hcl
terraform apply
```

Provider keys are sensitive — prefer environment injection over the tfvars file:

```bash
export TF_VAR_provider_secrets='{"OPENAI_API_KEY":"sk-...","ANTHROPIC_API_KEY":"sk-ant-..."}'
terraform apply
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

## Hardening (later)

- **SQLite reliability**: Azure Files SMB + WAL can hit locking edge cases.
  Migrate `/data` to an NFS share behind a private endpoint for production-grade
  durability.
- **Access**: front with Entra ID (Container Apps auth / Front Door) instead of
  relying solely on the bearer token; set `allowed_ip_cidrs`.
- **Network isolation**: VNet-integrate the environment and add private
  endpoints for Key Vault and Storage.
- **Non-root**: the image currently runs as root; drop privileges once provider
  CLIs and volume permissions are validated.
