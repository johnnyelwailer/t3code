# syntax=docker/dockerfile:1.7

# =============================================================================
# T3 Code server image for Azure Container Apps
#
# Build context MUST be the repository root:
#   docker build -f apps/server/Dockerfile -t t3code-server .
#
# Multi-stage:
#   1. builder  - installs the web+server workspace subgraph, builds the web
#                 client + server bundle (`vp run --filter t3 build`), then
#                 produces a pruned production node_modules via `pnpm deploy`.
#   2. runtime  - slim glibc Node image with git + provider CLIs + the pruned
#                 runtime tree. Runs `serve` headless.
#
# The server bundle (dist/bin.mjs) inlines @t3tools/* + effect-acp +
# effect-codex-app-server, but externalizes native/runtime deps (node-pty,
# @ff-labs/fff-node, effect, @anthropic-ai/*, @opencode-ai/*). Those must be
# present in node_modules at runtime, which is what `pnpm deploy --prod`
# provides. Native modules are compiled against glibc in the builder, so the
# runtime base MUST also be glibc (bookworm), NOT alpine/musl.
# =============================================================================

ARG NODE_VERSION=24.13.1
ARG PNPM_VERSION=10.24.0

# -----------------------------------------------------------------------------
# Stage 1: builder
# -----------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm AS builder
ARG PNPM_VERSION

# Toolchain required to compile native modules (node-pty, @ff-labs/fff-node).
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        git \
        python3 \
        build-essential \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

WORKDIR /src

# Copy the whole monorepo. .dockerignore keeps this lean (no node_modules,
# .git, .repos, mobile/desktop build outputs, etc.).
COPY . .

# Install only the web + server subgraph (and their workspace deps). This skips
# the heavy desktop/mobile/marketing toolchains (electron, expo) entirely.
# @t3tools/scripts is required: apps/server's build (scripts/cli.ts) imports the
# repo-root scripts/lib helpers, which depend on `effect`.
RUN pnpm install --frozen-lockfile \
        --filter "@t3tools/web..." \
        --filter "t3..." \
        --filter "@t3tools/scripts..."

# Build the web client then the server bundle. `vp run --filter t3 build`
# resolves the task graph: it builds @t3tools/web first, runs `vp pack`
# (-> apps/server/dist/bin.mjs) and copies apps/web/dist -> dist/client.
RUN pnpm exec vp run --filter t3 build

# Produce a pruned, production-only deployable at /runtime containing the built
# dist/ plus the externalized runtime node_modules (compiled native bits
# included). --legacy keeps deploy working without inject-workspace-packages.
# The filtered install omits the mobile-only patched packages
# (@expo/metro-config, react-native-nitro-modules); strip those patch entries so
# deploy's re-resolution doesn't fail on them as "unused patches".
RUN sed -i -e '\#patches/@expo#d' -e '\#patches/react-native-nitro-modules#d' pnpm-workspace.yaml \
    && pnpm --filter=t3 deploy --prod --legacy /runtime

# -----------------------------------------------------------------------------
# Stage 2: runtime
# -----------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS runtime

# git is required by the server (worktrees, checkpoints, commits).
# curl/ca-certificates are needed to install the Cursor CLI.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        git \
        curl \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# -----------------------------------------------------------------------------
# Provider CLIs (codex, claude, opencode, cursor "agent").
# Pinning to @latest at build time; rebuild the image to pick up new versions.
# Cursor installs `cursor-agent` into ~/.local/bin; T3 invokes it as `agent`,
# so we expose both names on PATH via symlinks.
# -----------------------------------------------------------------------------
RUN npm install -g \
        @openai/codex@latest \
        @anthropic-ai/claude-code@latest \
        opencode-ai@latest \
    && npm cache clean --force

RUN curl -fsS https://cursor.com/install | bash \
    && ln -sf /root/.local/bin/cursor-agent /usr/local/bin/cursor-agent \
    && ln -sf /root/.local/bin/cursor-agent /usr/local/bin/agent
ENV PATH="/root/.local/bin:${PATH}"

WORKDIR /app

# Pruned production tree (dist/bin.mjs, dist/client, node_modules).
COPY --from=builder /runtime/dist ./dist
COPY --from=builder /runtime/node_modules ./node_modules

# Persistent state (Azure Files mount) and an ephemeral scratch workspace where
# users clone repos for agent sessions.
RUN mkdir -p /data /workspace
VOLUME ["/data"]
WORKDIR /workspace

ENV NODE_ENV=production \
    NODE_OPTIONS=--enable-source-maps \
    T3CODE_HOME=/data \
    T3CODE_HOST=0.0.0.0 \
    T3CODE_PORT=3773 \
    T3CODE_NO_BROWSER=true \
    T3CODE_MODE=web

EXPOSE 3773

# Headless serve mode. Prints the connection string + bearer token + QR to the
# container logs on startup (retrieve with `az containerapp logs show`).
ENTRYPOINT ["node", "/app/dist/bin.mjs", "serve"]
