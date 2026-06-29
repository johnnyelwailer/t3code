# Native Provider Tool Injection: Additive-Only Design

## Goal

Support raw MCP/tool injection for Claude, Codex, Cursor, and OpenCode without editing existing provider adapter files during the first implementation phase.

## Additive-Only Constraints

- Add new `t3work-` prefixed files only.
- Do not modify existing provider runtime code in this phase.
- Keep implementation as a reusable contract that can be wired later through approved whitelist changes.
- Provider config/state used by the workaround must be workspace-local only, never user-global.

## Phase 1 Scope (implemented)

- New parser and planner module:
  - `apps/server/src/t3work-provider-tool-injection.ts`
- New integration tests:
  - `apps/server/integration/t3work-provider-tool-injection.integration.test.ts`
  - `apps/server/integration/t3work-provider-tool-injection-codex-cli.integration.test.ts`

## Workspace-Local Workaround

- Implemented Codex MCP registration via native CLI commands (`codex mcp add/list`) scoped to a workspace-local home directory.
- Default home path: `.t3work/provider-homes/codex` under `workspaceRoot`.
- Absolute paths and any path resolving outside `workspaceRoot` are rejected.
- Implemented OpenCode MCP registration via workspace-local `opencode.json` materialization plus `OPENCODE_CONFIG` override.
- Default OpenCode config path: `opencode.json` under `workspaceRoot`.
- Existing project config keys are preserved; only missing MCP server entries are added.
- Absolute paths and any path resolving outside `workspaceRoot` are rejected.

## Runtime Contract

Environment input:

- `T3WORK_RAW_TOOL_INJECTION_JSON`

Envelope shape:

- `providers.claudeAgent.mcpServers: unknown[]`
- `providers.cursor.mcpServers: unknown[]`
- `providers.opencode.mcpServers: Record<string, unknown>`
- `providers.codex.reloadMcpConfig: boolean`

Derived runtime plan:

- `claudeMcpServers?: unknown[]`
- `cursorMcpServers?: unknown[]`
- `openCodeMcpAdds: Array<{ name: string; config: Record<string, unknown> }>`
- `codexReloadMcpConfig: boolean`

## Why This Design

- Keeps provider-specific transformation logic in one additive module.
- Allows integration tests to lock behavior before wiring into adapters.
- Reduces risk in dirty worktrees and preserves constitution constraints.

## Wiring Plan (Phase 2)

When whitelist-approved edits are allowed, integrate plan consumption at provider boundaries:

- Claude: map `claudeMcpServers` into query options.
- Cursor/ACP: map `cursorMcpServers` into session/new|load payload.
- OpenCode: execute `openCodeMcpAdds` via SDK before session create.
- Codex: call MCP reload when `codexReloadMcpConfig` is true.

## Test Coverage

Integration tests currently verify:

- Multi-provider envelope parsing in one pass.
- Provider-specific plan derivation with safe defaults.
- Malformed JSON fallback behavior.
