# T3work Recipes/Skills/Tools Planning

## Current Status

### ✅ Already Implemented

1. **Recipe Model** (`packages/project-recipes/src/recipe.ts`)
   - `Recipe` struct: id, title, applicability rules, required context, skill ref, output preference
   - `RecipeMatchInput` / `RecipeMatchResult` types for applicability matching
   - `SkillRef` for referencing skills by id + version

2. **Integration Platform** (in place, Atlassian first)
   - `IntegrationProvider` interface with listAccounts, listProjects, listResources, getResource
   - Two-step mutation: prepareMutation → commitMutation
   - Resource snapshots and caching support
   - Atlassian routes in server (`t3work-atlassian-routes.ts`)

3. **Schema & Contracts** (`packages/contracts`)
   - Shared effect/Schema schemas for external models
   - Provider events and WebSocket protocol

4. **Custom UI Rendering (Domain Events)**
   - `ProposedPlan` timeline entry (plan-like UI)
   - `WorkLogEntry` timeline entry (tool activity logs)
   - `PendingUserInput` for ask-question-style UIs
   - `PendingApproval` for mutation approval flows
   - Timeline rows rendered natively by React (`MessagesTimeline.tsx`)
   - **Key insight:** Custom UIs do NOT come from tool returns; they come from orchestration domain events

5. **Documentation**
   - Epic 06: Recipes and Skills design
   - Epic 07: Skill Tools and Mutations (tool list & permission model)
   - Epic 12: Profiles and Skill Packs (structure and bundling)

### ❌ Not Yet Implemented

1. **packages/t3work-skill-packs**
   - Should contain bundled profile & pack definitions
   - Prompt blocks, artifact templates
   - Tool permission whitelists

2. **Tool Registry / Runtime Tool Injection**
   - No centralized way to register tools for a recipe/skill
   - No dispatch mechanism that's provider-agnostic (Codex/Claude/etc.)
   - No local tool surface in the server

3. **Tool Execution Layer**
   - Server-side tool handlers for integration reads
   - Tool handlers for artifact reads/writes
   - Tool handlers for mutation prepare/commit
   - UI primitive tool handlers (render table, timeline, etc.)

4. **Recipe ↔ Skill ↔ Tool Runtime Binding**
   - How recipes attach tool access at runtime
   - How the provider (Codex/Claude) receives the tool list
   - How tool calls are routed back to server

---

## Provider-Agnostic Tool Injection Strategy

### High-Level Design

Tools should be provided as a two-layer system:

```
┌─────────────────────────────────────┐
│   Recipe Runtime Context            │
│  (selected project, resource, etc)  │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│   Skill Runtime                     │
│  ├─ resolveApplicableTools()        │
│  └─ tools: Tool[]                   │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│   Provider Adapter (Codex/Claude)   │
│  ├─ mapToolsToProviderFormat()      │
│  └─ sendToolDefinitions()           │
└──────────────┬──────────────────────┘
               │
               ▼
        (Provider receives tools)
        (Provider calls tools via stdio)
               │
               ▼
┌─────────────────────────────────────┐
│   Tool Handler Dispatch (Server)    │
│  ├─ routeToolCall()                 │
│  └─ executeToolHandler()            │
└─────────────────────────────────────┘
```

### Key Principles

1. **Tool Definition is Provider-Agnostic**
   - Tools defined as `SkillTool` struct (see below)
   - Provider adapters map to provider-specific format (Codex JSON-RPC, Claude tool_use, etc.)
   - Handlers in the server work the same way regardless of provider

2. **Tool Access is Scoped by Recipe Context**
   - A recipe defines which tool groups it can access
   - Skill runtime filters available tools by:
     - Selected project
     - Selected resource kind
     - Integration account
     - Read vs. write capability
     - User permissions

3. **Mutation Tools Require Explicit Approval**
   - Mutation prepare tools always allowed
   - Mutation commit tools only available after UI approval
   - Audit trail recorded in artifact history

---

## Proposed Tool Schema

### SkillTool Type

```ts
type SkillToolParameter = {
  name: string;
  description: string;
  type: "string" | "number" | "boolean" | "object" | "array";
  required: boolean;
  enum?: string[];
  schema?: unknown; // JSON Schema for complex types
};

type SkillTool = {
  id: string;
  group: string; // "integration.read", "artifact.rw", "mutation", "ui.render", etc.
  name: string;
  description: string;
  parameters: SkillToolParameter[];
  returns: {
    type: "string" | "json" | "structured";
    description: string;
  };
  visibility: "read-only" | "mutation-prep" | "mutation-commit" | "ui-primitive";
  requiresIntegration?: string; // "atlassian", etc.
  requiresResource?: string; // "issue", "epic", etc.
};
```

### Tool Groups (from Epic 07)

**Read Tools:**

- `integration.accounts.list`
- `integration.projects.list`
- `integration.resources.list`
- `integration.resource.get`
- `integration.search`
- `jira.project.issues.list`
- `jira.issue.get`
- `jira.issue.comments.list`

**Artifact Tools:**

- `artifact.create`, `artifact.update`, `artifact.read`, `artifact.list`
- `plan.create`, `plan.update`
- `cache.write`, `cache.read`

**Mutation Tools:**

- `mutation.prepare`, `mutation.preview`, `mutation.commit`
- `jira.comment.prepare`, `jira.comment.commit`

**UI Primitive Tools:**

- `ui.render.table`, `ui.render.timeline`, `ui.render.checklist`
- `ui.render.form`, `ui.render.diff`, `ui.render.statusBoard`
- `ui.render.dependencyMap`, `ui.render.testMatrix`, `ui.render.mutationPreview`

---

## Implementation Plan

### Phase A: Core Infrastructure (Foundation)

1. **Define `SkillTool` and `ToolRegistry` contracts**
   - Location: `packages/contracts/src/skillTools.ts`
   - Export from contracts barrel

2. **Create `packages/t3work-skill-tools`**
   - Tool definitions for each group
   - Tool filters/permissions logic
   - Provider-agnostic tool descriptors

3. **Add tool resolution to Skill model**
   - `resolveApplicableTools(context): SkillTool[]`
   - Scope by: recipe, project, resource, integration, permissions

4. **Create tool handler registry in server**
   - `packages/server/src/t3work-tool-handlers/`
   - Handler for each tool group
   - Route tool calls from provider to handlers

### Phase B: Recipe ↔ Tool Binding

1. **Update Recipe model**
   - Add `allowedToolGroups?: string[]`
   - Skill pack definition includes tool permissions

2. **Implement Recipe Launcher (Phase 3 in delivery plan)**
   - When recipe is selected, resolve applicable tools
   - Attach tools to provider thread context

3. **Provider Adapters**
   - Codex adapter: map SkillTools to Codex JSON-RPC format
   - Claude adapter: map to tool_use format
   - Handle tool_call → handler routing

### Phase C: Tool Execution

1. **Integration Read Tools**
   - Handler wraps IntegrationProvider methods
   - Applies resource/account scoping

2. **Artifact Tools**
   - Handler persists to managed workspace
   - Returns artifact refs/snapshots

3. **Mutation Tools**
   - prepare: mock up the mutation, return preview
   - commit: execute only if approved in UI

4. **UI Primitive Tools**
   - Return structured block definitions
   - Web app renders blocks natively

---

## Critical Clarification: Custom UIs ≠ Tool Returns

**T3code does NOT use tool returns to render custom UIs.** This is an important design distinction:

### Current Approach: Domain Events → Timeline Entries

The system uses **domain events** emitted by the provider (Codex/Claude) that get projected into native UI components:

- **`ProposedPlan`** event → `ProposedPlan` timeline entry → PlanSidebar component
- **Tool activity** event → `WorkLogEntry` → activity log display
- **`PendingUserInput`** event → user input form (ask-question-style UI)
- **`PendingApproval`** event → approval dialog (for mutations)

This lives in `apps/web/src/session-logic.ts` (TimelineEntry types) and renders in `MessagesTimeline.tsx`.

### Why This Matters for Tools

**Tool return values are data, not UI directives.** When a skill calls:

- `integration.resources.list` → returns structured resource data (status, count, fields)
- `mutation.prepare` → returns mutation preview data (diff, description, target)
- `ui.render.table` → returns **data that defines a table** (rows, columns, cells)

The web app then renders these based on **native React components**, not HTML/MDX from the tool.

### Tool + Event Separation Example

When a skill wants to show a "test plan" UI:

1. **Skill logic** (in provider): Calls `artifact.create` with markdown content
2. **Tool handler** (server): Persists artifact, emits `ArtifactCreated` event
3. **Domain event** (server→web): `{ kind: "artifact-created", artifactId, type: "test-plan" }`
4. **UI rendering** (web): TimelineEntry for artifact, renders with TestPlanViewer component

This keeps the contract between skills and shell stable and provider-agnostic.

---

## Questions & Decisions Needed

1. **Tool Versioning**
   - Should tools be versioned separately from skills?
   - How do we handle breaking changes?

2. **Tool Error Handling**
   - Provider-agnostic error schema?
   - How verbose should tool errors be?

3. **Tool Caching**
   - Cache tool results (e.g., integration.resources.list)?
   - Cache key strategy?

4. **Tool Audit**
   - Record all tool calls in artifact history?
   - Include tool input/output in thread logs?

5. **UI Primitive Tools**
   - Should they be actual "tools" or just internal rendering?
   - Can skills call them, or only shell internals?

6. **Permission Model Detail**
   - How granular? (per-project, per-integration account, per-resource-kind)
   - Who decides permissions? (skill pack, recipe, project config, user)

---

## Minimal Viable Tool System (for Phase 3)

Start with just enough to validate recipes:

1. **One read tool:** `integration.resources.list`
   - Call Jira to list issues for selected project
   - Return raw snapshot + metadata

2. **One artifact tool:** `artifact.create`
   - Save recipe output as artifact
   - Return artifact ID for reference

3. **One mutation tool:** `jira.comment.prepare`
   - Draft a comment, return preview
   - Don't commit yet (Phase 5)

This validates:

- Tool definition model
- Tool scoping logic
- Provider integration path
- Handler dispatch
- UI artifact rendering

---

## Next Steps

1. Create `packages/t3work-skill-tools` with minimal tool definitions
2. Define `SkillTool` contract in `packages/contracts`
3. Add `resolveApplicableTools()` to skill/recipe context
4. Build tool handler dispatch in server
5. Integrate with Codex adapter (or mock provider)
6. Test recipe → tool → artifact flow end-to-end
