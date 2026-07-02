# Provider-Agnostic Features in T3 Code

T3 Code already has **extensive provider-agnostic infrastructure** that we can leverage for tools, recipes, and skills. This document lists concrete examples and how to use them.

Terminology note: "provider" here means an AI/code-agent provider such as Codex, Claude,
Cursor, or OpenCode. Work-system integrations such as Jira, GitHub, Linear, and Confluence
are connectors in the pack-driven t3work specs, even where older code fields still use
`provider`.

---

## 1. Provider Routing & Discovery (Already Agnostic)

### What's Implemented

**File**: [packages/contracts/src/providerInstance.ts](packages/contracts/src/providerInstance.ts#L70)

- `ProviderDriverKind` is an **open branded slug** — not a closed enum
- Allows extensibility to any provider (codex, claudeAgent, ollama, custom, etc.) without modifying contracts

**File**: [apps/server/src/provider/Services/ProviderAdapterRegistry.ts](apps/server/src/provider/Services/ProviderAdapterRegistry.ts)

- `ProviderAdapterRegistry` abstracts all provider routing
- Methods:
  - `getByInstance(instanceId)` — returns abstracted adapter **without knowing the driver**
  - `listInstances()` — discovers all live providers
  - `streamChanges()` — provider-agnostic notifications

### How to Leverage for Tools

**Scenario: "Tool needs to work across all providers"**

```typescript
// ❌ DON'T do this (provider-specific):
if (provider === "codex") {
  return codexApiCall(...);
} else if (provider === "claude") {
  return claudeApiCall(...);
}

// ✅ DO this (provider-agnostic):
const adapter = yield* ProviderAdapterRegistry.getByInstance(instanceId);
const toolResult = yield* adapter.callTool(toolName, inputs);
```

**Concrete benefit**: Tool handlers automatically work for Codex, Claude, custom providers, forks—**no code changes needed**.

---

## 2. Provider-Agnostic Command & Event Model

### What's Implemented

**File**: [packages/contracts/src/orchestration.ts](packages/contracts/src/orchestration.ts#L200-L300)

Core contracts:

- `ProviderRuntimeEvent` — **provider-specific** internal event format
- `OrchestrationEvent` — **provider-neutral** domain event format
- `OrchestrationThreadActivity` — normalized activity log

**Example domain events** (same for all providers):

```typescript
type OrchestrationEvent =
  | { type: "thread.activity-appended"; payload: { threadId, activity } }
  | { type: "thread.turn-start-requested"; payload: { ... } }
  | { type: "thread.approval-response-requested"; payload: { ... } }
  | { type: "thread.user-input-response-requested"; payload: { ... } }
  // ... no provider-specific branches
```

### Provider Runtime Events → Orchestration Events (Normalization)

**File**: [apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.ts](apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.ts)

Converts provider-specific → provider-neutral:

```typescript
// Input: ProviderRuntimeEvent (could be from Codex, Claude, etc.)
// Output: OrchestrationThreadActivity[] (normalized)

const activities = runtimeEventToActivities(event);
// Emits: { type: "thread.activity-appended", ... }
// Browser never knows which provider it came from
```

### How to Leverage for Tools

**Scenario: "Tool needs to emit custom activity log entry"**

Instead of creating provider-specific events, emit to `OrchestrationThreadActivity`:

```typescript
// Tool emits standardized activity
const activity: OrchestrationThreadActivity = {
  id: randomId(),
  tone: "tool", // provider-agnostic tone
  kind: "integration.resources.list", // standardized tool kind
  summary: "Loaded 42 Jira issues",
  payload: { count: 42, project: "ABC" }, // tool-specific data
  turnId: currentTurnId,
  createdAt: now(),
};

yield *
  emitOrchestrationEvent({
    type: "thread.activity-appended",
    payload: { threadId, activity },
  });
```

**Concrete benefit**: Any provider emitting this activity renders identically in the UI. Tool output is decoupled from how provider sent it.

---

## 3. Validation & Schema Composition (Already Agnostic)

### What's Implemented

**File**: [packages/contracts/src/baseSchemas.ts](packages/contracts/src/baseSchemas.ts)

All core types use Effect `Schema`:

- `TrimmedNonEmptyString`, `NonNegativeInt`, `IsoDateTime`
- Enables **composable, type-safe contracts** across providers

**File**: [packages/contracts/src/orchestration.ts](packages/contracts/src/orchestration.ts#L300-L350)

`OrchestrationThreadActivity` schema:

```typescript
export const OrchestrationThreadActivity = Schema.Struct({
  id: EventId,
  tone: OrchestrationThreadActivityTone, // "info" | "tool" | "approval" | "error"
  kind: TrimmedNonEmptyString, // "integration.resources.list", etc.
  summary: TrimmedNonEmptyString, // human-readable label
  payload: Schema.Unknown, // tool-specific data (validated by tool)
  turnId: Schema.NullOr(TurnId),
  createdAt: IsoDateTime,
});
```

### How to Leverage for Tools

**Scenario: "Define a new tool that works across providers"**

Create a schema for your tool's input/output:

```typescript
// In packages/contracts/src/ or tool package
export const IntegrationResourcesListInput = Schema.Struct({
  accountId: TrimmedNonEmptyString,
  projectId: TrimmedNonEmptyString,
  limit: Schema.optional(NonNegativeInt),
});

export const IntegrationResourcesListOutput = Schema.Struct({
  items: Schema.Array(Schema.Unknown), // normalized items
  total: NonNegativeInt,
  pageInfo: Schema.optional(Schema.Unknown),
});
```

Then the server tool handler validates with:

```typescript
const validated = yield * Schema.decodeUnknown(IntegrationResourcesListInput)(input);
const result = yield * callIntegration(validated);
yield * Schema.encodeUnknown(IntegrationResourcesListOutput)(result);
```

**Concrete benefit**: One schema definition, reused across all providers. Type safety from request to response.

---

## 4. Request/Approval Flow (Already Agnostic)

### What's Implemented

**File**: [apps/server/src/orchestration/Layers/ProviderCommandReactor.ts](apps/server/src/orchestration/Layers/ProviderCommandReactor.ts)

Orchestration layer handles approvals uniformly:

```typescript
// Same command handler for all providers
case "provider.respondToApprovalRequest": {
  const { instanceId, requestId, decision } = command;

  // ProviderService routes to correct adapter (Codex, Claude, etc.)
  yield* providerService.respondToApprovalRequest({
    instanceId,
    requestId,
    decision,  // "accept" | "decline" | "cancel" | "acceptForSession"
  });

  // Emits provider-agnostic event
  yield* emitOrchestrationEvent({
    type: "thread.approval-response-requested",
    payload: { ... },
  });
}
```

### How to Leverage for Tools

**Scenario: "Tool needs user approval before running mutation"**

1. Tool calls `mutation.prepare()` → returns preview
2. Skill emits approval request through orchestration
3. User sees unified approval UI (same for all providers)
4. Tool receives `ProviderApprovalDecision` ("accept", "decline", etc.)

```typescript
// Tool preparation (provider-agnostic)
yield *
  emitOrchestrationEvent({
    type: "thread.approval-response-requested",
    payload: {
      requestId: requestId,
      requestKind: "mutation-commit", // standardized kind
      detail: "Post comment to Jira issue ABC-123?",
    },
  });

// User approves → all providers handle response identically
if (decision === "accept") {
  yield * mutation.commit(mutationId);
}
```

**Concrete benefit**: Approval UI is unified; tool code doesn't branch on provider.

---

## 5. WebSocket Push Events (Provider-Agnostic Channel)\*\*

### What's Implemented

**File**: [packages/contracts/src/orchestration.ts](packages/contracts/src/orchestration.ts#L25-L35)

```typescript
export const ORCHESTRATION_WS_METHODS = {
  dispatchCommand: "orchestration.dispatchCommand",
  subscribeThread: "orchestration.subscribeThread", // ← unified channel
  // ...
};
```

**File**: [AGENTS.md](AGENTS.md#L52)

Browser subscribes to `orchestration.domainEvent`:

- **No provider-specific events ever reach the browser**
- All normalized through orchestration layer
- Web app renders `TimelineEntry` (message, work activity, proposed plan, etc.)

**Example flow**:

```
Codex emits: {"method": "turn.started", "turnId": "T123", ...}
             ↓ (ProviderRuntimeIngestion)
Orchestration event: {type: "thread.activity-appended", activity: {...}}
             ↓ (WebSocket push)
Browser: TimelineEntry { kind: "work", activity: {...} }
```

### How to Leverage for Tools

**Scenario: "Render custom tool activity in timeline"**

Tool emits standard `OrchestrationThreadActivity` → browser automatically renders:

```typescript
// Server-side tool handler
const activity: OrchestrationThreadActivity = {
  kind: "integration.jira.issues.list",
  tone: "tool",
  summary: "Found 42 issues",
  payload: {
    count: 42,
    fields: ["status", "assignee", "priority"],
  },
};

// Browser automatically renders as TimelineEntry
// Codex, Claude, custom provider: same rendering!
```

**Concrete benefit**: Tools don't need provider-specific UI code. Orchestration layer handles presentation uniformly.

---

## 6. Session Lifecycle (Provider-Agnostic)\*\*

### What's Implemented

**File**: [packages/contracts/src/orchestration.ts](packages/contracts/src/orchestration.ts#L500-L600)

```typescript
export const OrchestrationSession = Schema.Struct({
  threadId: ThreadId,
  status: OrchestrationSessionStatus, // "idle" | "running" | "ready" | "error"
  providerInstanceId: ProviderInstanceId, // routing key (not driver kind)
  runtimeMode: RuntimeMode,
  activeTurnId: TurnId | null,
  lastError: string | null,
  // ... no provider-specific fields
});
```

### How to Leverage for Tools

**Scenario: "Tool needs to check if session is ready"**

Same code works for all providers:

```typescript
const session = orchestrationState.getSession(threadId);

// Provider-agnostic checks
if (session.status !== "ready") {
  yield * Effect.fail(new Error("Session not ready"));
}

// Tool can execute without knowing provider
const result = yield * anyToolHandler(inputs);
```

**Concrete benefit**: Tool health checks, preconditions, fallbacks work identically across all providers.

---

## 7. Model Selection & Provider Options (Agnostic Routing)\*\*

### What's Implemented

**File**: [packages/contracts/src/orchestration.ts](packages/contracts/src/orchestration.ts#L55-L125)

```typescript
export const ModelSelection = Schema.Struct({
  instanceId: ProviderInstanceId, // ← routing key
  model: TrimmedNonEmptyString, // model name (provider-specific, but opaque)
  options: Schema.optional(ProviderOptionSelections),
});
```

Provider doesn't determine routing; `instanceId` does. Multiple instances of same provider possible:

- `codex_personal` → Codex instance A
- `codex_work` → Codex instance B
- `claude_research` → Claude instance

### How to Leverage for Tools

**Scenario: "Tool needs to adapt to available model capabilities"**

```typescript
const selection = orchestrationState.modelSelection;

// Get capabilities without knowing provider
const capabilities = yield* resolveModelCapabilities(selection);

// Same tool code:
if (capabilities.supportsVision) {
  yield* processImageAttachment(...);
}
```

**Concrete benefit**: Tool doesn't care if it's Codex, Claude, or fork. One code path.

---

## 8. Artifact Persistence (Provider-Agnostic Container)\*\*

### What's Implemented

**File**: [apps/server/src/t3work-artifact-store.ts](apps/server/src/t3work-artifact-store.ts) (if it exists) or similar

Artifacts are persisted in:

- Managed workspace (not provider-specific)
- Can be read/referenced by any provider in any future thread
- Provider-neutral reference: artifact ID

### How to Leverage for Tools

**Scenario: "Tool creates rich output that persists beyond thread lifetime"**

```typescript
// Tool creates artifact
const artifact =
  yield *
  artifact.create({
    type: "test-plan",
    content: markdownContent,
    threadId: currentThreadId,
    // No provider field — artifact is provider-neutral
  });

// Emit activity linking artifact
yield *
  emitOrchestrationEvent({
    type: "thread.activity-appended",
    payload: {
      activity: {
        kind: "artifact.created",
        summary: "Test plan created",
        payload: { artifactId: artifact.id },
      },
    },
  });

// Later: different provider, different thread, same artifact
const reopenedArtifact = yield * artifact.read(artifact.id);
```

**Concrete benefit**: Tools can create durable outputs that work across providers and threads.

---

## Summary Table: What's Already Provider-Agnostic

| Feature               | Location                        | How It Works                     | Leverage For                    |
| --------------------- | ------------------------------- | -------------------------------- | ------------------------------- |
| **Provider Routing**  | `ProviderAdapterRegistry`       | Instance ID-based dispatch       | Tools that work on any provider |
| **Domain Events**     | `OrchestrationEvent`            | Normalized event schema          | Activity logs, timelines        |
| **Schema Validation** | `packages/contracts/src/`       | Effect `Schema` composition      | Type-safe tool I/O              |
| **Approval Flow**     | `ProviderCommandReactor`        | Unified command handling         | Tool mutations & user consent   |
| **WebSocket Channel** | `orchestration.subscribeThread` | Provider-agnostic push           | Real-time UI updates            |
| **Session Lifecycle** | `OrchestrationSession`          | Status enum (no provider fields) | Tool preconditions              |
| **Model Selection**   | `ModelSelection` struct         | Instance ID routing              | Tool capability detection       |
| **Artifact Store**    | Managed workspace               | Provider-neutral persistence     | Durable tool outputs            |

---

## Next: How to Build Tools Using These Abstractions

### Phase 1: Define Tool Contracts

1. Create `packages/t3work-skill-tools/src/tools/integration.resources.list.ts`
2. Use Effect `Schema` for input/output validation
3. No provider branching in the contract

### Phase 2: Implement Tool Handler

1. Use `ProviderAdapterRegistry` for provider-agnostic lookups
2. Emit `OrchestrationThreadActivity` for activity logs
3. Return standardized output (validated by schema)

### Phase 3: Connect to Recipe Lifecycle

1. Recipe resolves applicable tools based on context
2. Server dispatches tool calls → handlers
3. Handlers emit activities and artifacts
4. Browser renders unified timeline

**Example concrete flow**:

```
Recipe "List Jira Issues" selected on Project ABC
  ↓
Skill resolves tools: [integration.projects.list, integration.resources.list]
  ↓
Provider (any) receives tool definitions
  ↓
Provider calls: integration.resources.list({projectId: "ABC"})
  ↓
Server handler: ProviderAdapterRegistry.getByInstance() → callIntegration() → validate with schema
  ↓
Emit: OrchestrationThreadActivity { kind: "integration.resources.list", ... }
  ↓
Browser: TimelineEntry rendered (same for Codex, Claude, fork, etc.)
```

---

## Files to Reference

- **Contracts**: [packages/contracts/src/orchestration.ts](packages/contracts/src/orchestration.ts)
- **Provider Routing**: [apps/server/src/provider/Services/ProviderAdapterRegistry.ts](apps/server/src/provider/Services/ProviderAdapterRegistry.ts)
- **Event Ingestion**: [apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.ts](apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.ts)
- **Command Dispatch**: [apps/server/src/orchestration/Layers/ProviderCommandReactor.ts](apps/server/src/orchestration/Layers/ProviderCommandReactor.ts)
- **Web Integration**: [apps/web/src/session-logic.ts](apps/web/src/session-logic.ts) (TimelineEntry types)
- **WebSocket Contracts**: [packages/contracts/src/orchestration.ts#L25-L35](packages/contracts/src/orchestration.ts#L25-L35)
