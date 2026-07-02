# Native Provider Tool Injection

## Purpose

Define how t3work injects custom tools into each provider using the most native mechanism available, while keeping additive architecture and constitution constraints.

Terminology note: in this document, **provider** means an AI/code-agent provider
integration (Codex, Claude Code, Cursor, OpenCode), not a work-system connector such as
Atlassian or Linear. Workspace packs may add or configure these AI provider integrations,
but host policy remains the enforcement point.

Visual review version:

- [14-native-provider-tool-injection-plan.html](./14-native-provider-tool-injection-plan.html)

Primary concern:

- Each provider should use its most native tool-injection path.
- Runtime SDK tool injection is preferred when available.
- File-system discovery or side-directory MCP server registration is fallback only.

## Decision Policy

Use this priority order per provider:

1. Runtime native injection (preferred)

- Use provider SDK/runtime APIs that register tools at session startup or during session execution.
- Keep tool contracts explicit and typed.

2. Native provider MCP registration

- Use provider-supported MCP registration flows if runtime injection is unavailable.
- Prefer provider-authenticated MCP flows over custom file conventions.

3. Provider file/discovery conventions (last resort)

- Use only when no runtime API and no first-class MCP registration path exist.
- Must be isolated behind adapter logic and documented as temporary/compatibility mode.

## Constraints

- Additive-first implementation under t3work paths.
- No provider-specific business logic in shared UI components.
- External writes remain reviewable and explicitly approved.
- Tool outputs should produce durable artifacts when they affect workflow state.

## Target Outcomes

- One t3work tool contract surface.
- Thin provider adapters for transport/injection differences.
- Consistent orchestration event projection regardless of provider.
- Minimal duplication across providers.

## Required Tool Capabilities (Contract v0)

The t3work tool layer must satisfy all capabilities below across providers.

### 1) Host-Agent Bridge

Each tool is a brokered bridge, not a direct client-side integration.

Must support:

- Agent request -> host backend execution -> agent response.
- Correlated lifecycle events (`requested`, `inProgress`, `awaitingUserInput`, `completed`, `failed`).
- Idempotent request identity (`invocationId`) to prevent duplicate mutations on retries/reconnects.
- Durable artifact emission for outputs that affect workflow state.

Operational rule:

- Provider adapters may transform transport, but execution authority stays in host backend.

### 2) Current State + Context Access

Tools must execute against explicit session context, never ambient global state.

Must support:

- A typed `ToolExecutionContext` attached to every invocation.
- Context fields for at least: tenant/account, project, workspace, thread/session, actor.
- Optional hydrated data snapshots for current screen context (project summary, ticket subset, selected resource).
- Context version/hash to detect stale reads before mutation.

### 3) Security + Scope Isolation

Context scoping is a hard security boundary.

Must enforce:

- Project/tenant scoped authorization before execution.
- Deny-by-default data access outside invocation scope.
- Server-side scope validation (never trust provider/client supplied scope blindly).
- Mutation approval gates for side-effecting operations.
- Redaction policy for secrets/tokens in tool outputs and logs.

Minimum guard rails:

- `scope` object is mandatory and validated in backend policy layer.
- Cross-project reads/writes are rejected unless explicitly authorized by a privileged tool policy.

### 4) Flexible Rich Rendering Contract

Tools must support both predefined app UIs and generated HTML views.

Must support render modes:

- Predefined app view: MCP-app style known component payload.
- Generated HTML view: sanitized HTML artifact generated at runtime.

Must support presentation targets:

- Conversation card: inline, ephemeral or durable artifact card in thread timeline.
- Persistent sidecar: long-lived panel keyed by stable `viewKey` and refresh semantics.

Rendering requirements:

- Render payload is separate from tool business result payload.
- Generated HTML must pass sanitizer policy and CSP-compatible asset rules.
- Sidecar updates are incremental and versioned so reconnect can restore current UI state.

### 5) Human-In-The-Loop Mutation Control

Cards and sidecars are the primary mutation surface for external systems.

Must enforce:

- Agent may compute drafts, previews, and live-refreshing UI state.
- Agent may execute read/simulate/revalidate calls that update the sidecar/card representation.
- Final commit actions (for example `Save`, `Apply`, `Create`, `Delete`, `Transition`) must be user-initiated UI clicks.
- Backend rejects commit requests that are not bound to a recent user action token from the rendered UI.

Design intent:

- Keep the agent powerful for preparation and iteration.
- Keep irreversible external writes under explicit human confirmation.

## Canonical Contract Shape (Draft)

```ts
type ToolInvocationEnvelope = {
  invocationId: string;
  toolName: string;
  mode: "runtime-native" | "mcp-backed";
  scope: {
    tenantId: string;
    accountId?: string;
    projectId: string;
    workspaceId?: string;
    threadId: string;
    actorId: string;
  };
  context: {
    snapshotVersion?: string;
    selectedResourceIds?: ReadonlyArray<string>;
    tags?: ReadonlyArray<string>;
  };
  input: unknown;
};

type ToolResultEnvelope = {
  invocationId: string;
  status: "completed" | "failed" | "awaitingUserInput";
  data?: unknown;
  artifactRefs?: ReadonlyArray<{ id: string; kind: "json" | "markdown" | "html" }>;
  render?: {
    target: "conversationCard" | "persistentSidecar";
    viewKey?: string;
    mode: "predefined" | "generatedHtml";
    payload: unknown;
    payloadVersion: number;
  };
  security?: {
    redactionsApplied: number;
    scopeValidated: boolean;
  };
};
```

## Non-Negotiable Enforcement Rules

1. No invocation runs without validated scope.
2. No mutation runs without explicit side-effect classification and approval policy.
3. No generated HTML renders without sanitization and policy checks.
4. No provider adapter may bypass host authorization.
5. No external commit mutation may execute without user-click provenance from card/sidecar UI.

## Mutation Interaction Model (Required)

1. Agent produces draft mutation intent and preview diff.
2. Card/sidecar renders current draft and live status.
3. Agent may continue updating draft; UI refreshes in place.
4. User clicks explicit commit control (`Save`/`Apply`).
5. Backend validates scope + user-action token + policy gates.
6. External mutation executes and sidecar/card refreshes to authoritative post-write state.

## Action + UI Catalog (Scaffold)

This catalog defines first-class actions and preferred UI surfaces in t3work.

### Jira Actions

1. Ticket triage batch (read + draft)

- Goal: suggest priority, labels, assignee, and sprint placement.
- Preferred UI: persistent sidecar with queue table and per-ticket draft chips.
- Commit model: user clicks `Apply Selected`.

2. Ticket field edit (single)

- Goal: edit summary, description, labels, components, estimate, due date.
- Preferred UI: card for quick edits, sidecar for multi-field review.
- Commit model: user clicks `Save`.

3. Workflow transition

- Goal: move ticket across Jira states with required checks.
- Preferred UI: card with transition checklist and blockers.
- Commit model: user clicks `Transition`.

4. Comment compose/review

- Goal: draft internal/public comments with policy-safe language.
- Preferred UI: card with diff between original draft and final text.
- Commit model: user clicks `Post Comment`.

5. Bulk mutation plan

- Goal: apply same change to N tickets with dry-run preview.
- Preferred UI: sidecar with selection grid, impact summary, and error rows.
- Commit model: user clicks `Apply N Changes`.

### Confluence Actions

1. Page draft from ticket context

- Goal: generate structured page draft (status, risks, rollout, owners).
- Preferred UI: sidecar rich editor with section-level regeneration.
- Commit model: user clicks `Create Page`.

2. Page update with review diff

- Goal: patch existing page content while preserving style conventions.
- Preferred UI: sidecar split diff (current vs proposed).
- Commit model: user clicks `Publish Update`.

3. Knowledge extraction and link-back

- Goal: extract decisions from thread/tickets and add references.
- Preferred UI: card for quick acceptance, sidecar for full citation editing.
- Commit model: user clicks `Append Section`.

4. Runbook/template instantiation

- Goal: materialize predefined operational templates from context.
- Preferred UI: sidecar form + generated preview.
- Commit model: user clicks `Create From Template`.

### Computer Use / Browser Use Actions

1. Guided navigation automation

- Goal: let agent navigate target web app and prepare proposed changes.
- Preferred UI: sidecar live activity timeline with screenshots/events.
- Commit model: user clicks `Execute Final Step` when an irreversible step is reached.

2. Form fill preparation

- Goal: prefill complex forms from context and validate required fields.
- Preferred UI: sidecar form mirror + validation panel.
- Commit model: user clicks native target-app submit control or mirrored `Submit` gate.

3. Multi-step external workflow replay

- Goal: replay a verified sequence with checkpoints.
- Preferred UI: sidecar stepper with pause/resume and per-step evidence.
- Commit model: user clicks `Continue` at guarded checkpoints.

4. Evidence capture for compliance

- Goal: collect screenshots, page snapshots, and action logs.
- Preferred UI: conversation card summary + sidecar artifact browser.
- Commit model: user clicks `Finalize Evidence Bundle`.

## Computer Use Tech Decision (Ambiguity Resolved)

Decision:

- Split the implementation into two distinct capability tracks.
- Browser Use track: Playwright is the default browser automation engine.
- Computer Use track: evaluate two primary candidates in parallel:
  - CUA-style agent control for broader desktop interaction.
  - xa11y-style accessibility-tree-first control for higher determinism where accessibility surfaces are available.
- Both tracks must conform to one host-authoritative tool contract and the same mutation approval gates.

Why this split is required:

- Browser automation and computer control are different problem spaces with different guarantees.
- Browser Use favors deterministic DOM-first actions and replayability.
- Computer Use must handle non-DOM surfaces, desktop coordinates, OCR/vision uncertainty, and guarded irreversible steps.
- Keeping them separate avoids false equivalence in reliability and security assumptions.

### Framework Comparison (Current Recommendation)

| Option                                         | Scope        | Strengths                                                                                          | Risks / Gaps                                                                           | Fit For t3work Contract                                                             | Decision                        |
| ---------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------- |
| Playwright (OSS)                               | Browser Use  | Mature browser automation, rich traces/screenshots, strong TS ergonomics                           | Browser-centric only; not full desktop computer control                                | Excellent for Browser Use with deterministic step logs and evidence capture         | **Browser Use default**         |
| Managed Playwright (for example Browserbase)   | Browser Use  | Elastic hosted sessions and simpler ops at scale                                                   | Cost/vendor dependency and governance review needed                                    | Strong if wrapped by same adapter and artifact schema                               | Optional Browser Use scale mode |
| CUA (for example trycua/cua style)             | Computer Use | Explicit computer-use model for non-DOM workflows and desktop interaction                          | Less deterministic than DOM automation; stronger policy and checkpoint design required | Strong for Computer Use when host keeps execution authority and click-gated commits | Primary Computer Use candidate  |
| xa11y-style runtime (accessibility-tree-first) | Computer Use | Accessibility-structure-first actions can improve reproducibility versus pure pixel/vision control | Depends on target app accessibility quality and platform support                       | Strong when available; can be preferred for guarded enterprise workflows            | Primary Computer Use candidate  |
| Puppeteer                                      | Browser Use  | Simple Chromium automation                                                                         | Weaker cross-browser posture and fewer batteries than Playwright                       | Useful fallback for Chromium-only paths                                             | Not primary                     |
| Selenium / WebDriver BiDi                      | Browser Use  | Broad enterprise compatibility                                                                     | Higher protocol and infra complexity for MVP velocity                                  | Viable for compatibility requirements, expensive for MVP                            | Defer                           |

### Required Architecture Shape

1. Define two adapters with shared envelope semantics.
2. `BrowserUseAdapter` actions (`navigate`, `click`, `type`, `select`, `waitFor`, `screenshot`, `snapshotDom`).
3. `ComputerUseAdapter` actions (`observeScreen`, `movePointer`, `clickAt`, `typeText`, `hotkey`, `captureEvidence`, `requestCheckpoint`).
4. Implement `PlaywrightBrowserUseAdapter` first.
5. Implement `CuaComputerUseAdapter` and `Xa11yComputerUseAdapter` pilots behind one `ComputerUseAdapter` capability probe.
6. Every step emits durable evidence artifacts (screenshot + action log + context summary + timestamp).
7. Any side-effecting step requires user-click provenance token validation before execution.

### Delivery Order

1. Ship Browser Use MVP with Playwright adapter and evidence bundle.
2. Ship Computer Use pilots with CUA and xa11y-style adapters on narrow guarded workflows.
3. Add explicit guarded checkpoints for all irreversible Computer Use steps.
4. Add managed Browser Use runtime only after local stability under reconnect/retry.
5. Select default Computer Use runtime by measured reliability, then expand coverage.

## Generative UI Artifact Modes (Instead Of Markdown Blobs)

These are rich artifacts produced by tools and rendered as cards or sidecars.

1. Interactive plan board

- Use: planning and execution tracking.
- UI: kanban/stepper with status, owners, blockers, and action buttons.

2. Educational walkthrough

- Use: explain systems, incidents, or migrations.
- UI: progressive reveal with checkpoints and embedded examples.

3. Review artifact

- Use: summarize proposed external mutations with evidence and risk scoring.
- UI: diff-centric card/sidecar with approve/reject controls.

4. Decision record artifact

- Use: capture tradeoffs, alternatives, and final decision.
- UI: structured ADR-style panel with references and timeline.

5. Operational readiness artifact

- Use: launch/change readiness gates.
- UI: checklist dashboard with live health signals and unresolved blockers.

Requirement:

- Any artifact that enables external mutation must enforce user-click commit gates exactly like Jira/Confluence/browser actions.

## Investigated Provider SDK Capabilities

This section captures evidence from local SDK type definitions and current adapter implementations.

### Claude Agent SDK

Evidence:

- Query/session options include `mcpServers`, `permissionMode`, `allowedTools`, `disallowedTools`, and `canUseTool`.
- Query control surface includes `setModel`, `setPermissionMode`, and `setMcpServers`.
- SDK includes `createSdkMcpServer(... tools: ...)` for in-process MCP tool definitions.

Repository evidence:

- `node_modules/.bun/@anthropic-ai+claude-agent-sdk@0.2.111+3c5d820c62823f0b/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts`
- `apps/server/src/provider/Layers/ClaudeAdapter.ts`

Conclusion:

- Strong native path exists.
- Preferred strategy: runtime-native registration via SDK controls first, then MCP server config via SDK, no file-discovery-first approach.

### Codex App Server (effect-codex-app-server)

Evidence:

- Exposed client methods include `mcpServer/tool/call`, `mcpServerStatus/list`, `mcpServer/oauth/login`, and `skills/list`.
- Server request methods include `item/tool/call` and `item/tool/requestUserInput`.
- Schema includes dynamic tool call request/response payloads.

Repository evidence:

- `packages/effect-codex-app-server/src/_generated/meta.gen.ts`
- `packages/effect-codex-app-server/src/_generated/schema.gen.ts`
- `apps/server/src/provider/Layers/CodexAdapter.ts`

Conclusion:

- Native runtime supports dynamic tool call flow and MCP operations, but this investigation did not find a first-class "register arbitrary new tools at runtime" method equivalent to Claude's dynamic `setMcpServers` in the exposed protocol surface.
- Preferred strategy: fulfill tool contract through host-side dynamic tool call handling plus MCP server operations.

### Cursor ACP

Evidence:

- ACP supports `session/set_mode`, `session/set_config_option`, `session/request_permission`, and `session/update` with `tool_call`/`tool_call_update` updates.
- Cursor extension methods implemented in adapter path: `cursor/ask_question`, `cursor/create_plan`, `cursor/update_todos`.

Repository evidence:

- `packages/effect-acp/src/_generated/meta.gen.ts`
- `packages/effect-acp/src/_generated/schema.gen.ts`
- `apps/server/src/provider/acp/CursorAcpExtension.ts`
- `apps/server/src/provider/Layers/CursorAdapter.ts`

Conclusion:

- Strong native event/control path for permissions, interactive user input, plan/todo flow, and tool lifecycle projection.
- Direct runtime registration of arbitrary custom tools was not identified in ACP core from this investigation.
- Preferred strategy: extension-method pathway + tool-call lifecycle bridge + mode/config controls.

### OpenCode SDK

Evidence:

- SDK types include rich MCP local/remote config, auth flows, MCP status endpoints, and MCP tool change events (`mcp.tools.changed`).
- Runtime event model includes permission and question ask/reply events and tool part lifecycle state.

Repository evidence:

- `node_modules/.bun/@opencode-ai+sdk@1.3.15/node_modules/@opencode-ai/sdk/dist/v2/gen/types.gen.d.ts`
- `apps/server/src/provider/Layers/OpenCodeAdapter.ts`

Conclusion:

- Strong native MCP-centric path with interactive permission/question support.
- Preferred strategy: native MCP add/connect/auth/status lifecycle plus event bridge.

## Contract Fulfillment Strategy By Provider

| Provider | Native Runtime Injection                           | Native MCP                 | Recommended Fulfillment Path                                                                                  |
| -------- | -------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Claude   | Yes (strong evidence)                              | Yes                        | Use runtime SDK controls (`setMcpServers`, `canUseTool`, permission/model setters) as primary path.           |
| Codex    | Partial (dynamic tool call flow)                   | Yes                        | Implement host tool execution contract for `item/tool/call`; use MCP methods for server-backed tools.         |
| Cursor   | Partial (ACP extensions + tool updates)            | Indirect via ACP ecosystem | Implement tool contract via ACP extension methods + `tool_call` updates + permission hooks.                   |
| OpenCode | No direct runtime tool registration identified yet | Yes (strong evidence)      | Implement MCP-first contract fulfillment and map permission/question/tool events to canonical runtime events. |

## Implications For The New t3work Tool Contract

1. The contract should define two fulfillment modes:

- `runtime-native`
- `mcp-backed`

2. The contract executor should support provider-specific transport adapters:

- Claude adapter can implement true runtime-native registration.
- Codex/Cursor/OpenCode adapters should support MCP-backed and/or host-executed dynamic tool calls.

3. Do not assume all providers expose the same registration primitive.

- Keep one semantic contract; allow multiple capability-backed fulfillers.

## Gaps To Confirm Before Build

1. Codex protocol: whether newer app-server revisions expose explicit runtime tool registration APIs beyond current generated surface.
2. Cursor ACP: whether extension APIs include custom tool registration beyond current ask-question/plan/todos patterns.
3. OpenCode: whether experimental tool endpoints can be safely used as stable runtime-native registration.

## Proposed Architecture (Scaffold)

### 1. Tool Contract Layer

Define a provider-neutral tool contract with:

- tool id
- display metadata
- input schema
- output schema
- auth/scope requirements
- side effects classification (read-only, mutation, external-write)

### 2. Injection Adapter Layer

One adapter per provider that maps the shared contract to native injection capabilities:

- runtime sdk injector
- native mcp registrar
- file/discovery fallback injector

Each adapter must expose:

- capability probe
- injection strategy selected
- registration status + diagnostics

### 3. Runtime Event Bridge

Map provider-specific tool lifecycle to canonical runtime events so existing t3code UX can render:

- tool started/progress/completed
- user input requested/resolved
- plan/todo updates where relevant

### 4. Artifact + Review Layer

For mutation-capable tools:

- prepare preview
- explicit approval gate
- commit execution
- artifact persistence with references

## Provider Capability Matrix (Template)

| Provider | Runtime SDK Injection | Native MCP Path  | File Discovery Fallback | Preferred Strategy | Notes |
| -------- | --------------------- | ---------------- | ----------------------- | ------------------ | ----- |
| Claude   | Research pending      | Research pending | Research pending        | Research pending   |       |
| Codex    | Research pending      | Research pending | Research pending        | Research pending   |       |
| Cursor   | Research pending      | Research pending | Research pending        | Research pending   |       |
| OpenCode | Research pending      | Research pending | Research pending        | Research pending   |       |

## Provider Research Questions

1. Which providers support dynamic tool registration after session start versus startup-only?
2. Which providers expose structured UI payload channels for card-style interaction?
3. Which providers can surface scoped auth context to tools without leaking secrets?
4. What is the minimum canonical event set required for identical UX across providers?

These are implementation research gates, not pack-vision product questions. Pack-provided
AI provider integrations are allowed, but the host still chooses the safest injection path
per provider.

## Acceptance Criteria

1. Every supported provider has a documented preferred injection strategy.
2. Preferred strategy is runtime-native when available.
3. Fallback strategy is documented with rationale and migration plan.
4. Shared tool contracts are provider-agnostic and versioned.
5. Mutation-capable tools require explicit review and persist artifacts.

## Next Steps

1. Fill capability matrix with evidence from provider SDK/docs and current implementation.
2. Define first two t3work tools (one read-only, one mutation-preview).
3. Implement adapter interface and one provider pilot.
4. Validate end-to-end event projection in existing t3code chat and side panels.
