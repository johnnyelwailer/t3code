# Epic 19: Workspace Miniapps

## Purpose

Miniapps are agent-created React artifacts that render workflow-specific UI inside
`t3work`.

A dashboard is only one render location. The core primitive is the miniapp: a
workspace-owned artifact with a manifest, React entrypoint, declared placements, and
declared tool capabilities.

The miniapp **is** the **View** primitive from [Epic 16](./16-action-recipes.md). A recipe
action launcher (in the dashboard or side panel) and an interactive conversation card are
both miniapps mounted at different placements (`action`, `conversation.inlineCard`,
`conversation.sidecar`) — not separate UI mechanisms. Views, Workflows, Tools, and Context
are the four shared primitives all `t3work` automation is built on; this epic owns Views.

## Product Model

Miniapps should let users and agents extend the shell without changing core app code.

Examples:

- project health panel
- CI triage sidecar
- release readiness dashboard
- ticket review inline card
- test plan editor
- decision record viewer
- recipe launcher with custom form inputs

Miniapps are created through agent workflows or action recipes. The agent should
interview the user, write the miniapp files into the active workspace, and leave the
result as inspectable source.

## Workspace Ownership

Miniapps live in the workspace that owns them.

Project-scoped miniapps:

```text
<project-workspace>/
  .t3work/
    miniapps/
      project-health/
        miniapp.json
        App.tsx
        README.md
```

User-global miniapps should live in a special home workspace:

```text
<home-workspace>/
  .t3work/
    miniapps/
      command-center/
        miniapp.json
        App.tsx
```

The home workspace is the source for user-scoped miniapps, recipes, and other personal
extensions. It may be git backed like any project workspace. When `t3work` creates a
managed project or home workspace, it should initialize git automatically if no repo is
present so miniapp changes have normal source history.

Sharing can be added by promoting a project miniapp into the home workspace, or by
including/referencing a miniapp from another trusted workspace.

## Manifest

Every miniapp requires a manifest.

```json
{
  "id": "project-health",
  "version": "0.1.0",
  "name": "Project Health",
  "scope": "project",
  "entry": "./App.tsx",
  "placements": [
    { "type": "dashboard", "title": "Health" },
    {
      "type": "conversation.inlineCard",
      "artifactKinds": ["health-report"]
    },
    { "type": "conversation.sidecar", "title": "Health" }
  ],
  "tools": ["artifact.list", "recipe.run", "git.status"],
  "components": ["Button", "Badge", "Table", "Chart", "Timeline"]
}
```

The manifest is the review surface. It tells the shell where the miniapp may appear,
which tools it may call, and which shell-provided component modules it expects.

Consistent with the code-based direction in [Epic 16](./16-action-recipes.md), placement
and tool declarations may also be expressed from a TypeScript plugin module rather than raw
JSON. The declarative manifest is retained as a pre-execution review surface — the shell
must be able to show placements and requested capabilities (and gate enablement) _before_
running any miniapp code.

## Placements

Known placements:

- `dashboard`: persistent project or home page location.
- `project.navView`: full project view reachable from project navigation.
- `global.navView`: full user/global view reachable from global navigation.
- `conversation.inlineCard`: compact renderer inside an agent conversation.
- `conversation.sidecar`: interactive side panel beside a conversation.
- `artifact.detail`: custom artifact detail renderer.
- `workspace.sidebar`: compact project navigation widget.
- `home.block`: global home workspace block.
- `modal`: focused wizard or review flow.
- `commandPalette.result`: small preview or action row.

Placement is host-owned. A miniapp declares supported placements. The shell decides
where and when to mount it.

Example host context:

```ts
type MiniappHostContext = {
  placement:
    | "dashboard"
    | "project.navView"
    | "global.navView"
    | "conversation.inlineCard"
    | "conversation.sidecar"
    | "artifact.detail"
    | "workspace.sidebar"
    | "home.block"
    | "modal"
    | "commandPalette.result";
  workspaceId: string;
  projectId?: string;
  threadId?: string;
  messageId?: string;
  artifactId?: string;
  resourceRef?: ResourceRef;
};
```

## Custom Views

Current first-party surfaces such as Backlog and My Work are effectively hardcoded
project dashboards. They prove the interaction model, but they should not remain the
only way to add dense project views.

The miniapp model should allow custom views to register into navigation:

- project nav: views scoped to one project workspace.
- global nav: views from the home workspace or enabled global miniapps.
- optional resource nav: views attached to one work item, repository, account, or other resource.

Example:

```json
{
  "id": "planning-board",
  "name": "Planning Board",
  "scope": "project",
  "entry": "./App.tsx",
  "placements": [
    {
      "type": "project.navView",
      "label": "Planning",
      "icon": "layout-dashboard",
      "order": 40
    }
  ],
  "tools": ["artifact.list", "integration.search", "recipe.run"],
  "components": ["Button", "Table", "KanbanBoard", "Timeline"]
}
```

Navigation registration should be declarative. The shell owns ordering, collision
handling, disabled states, and permission prompts. A broken custom view should fail as
one nav item, not break the project shell.

Miniapps should adapt density by placement.

```tsx
export default function App({ host }: { host: MiniappHostContext }) {
  if (host.placement === "conversation.inlineCard") {
    return <CompactSummary />;
  }

  if (host.placement === "conversation.sidecar") {
    return <ReviewPanel />;
  }

  return <FullDashboard />;
}
```

## Runtime Contract

Miniapps are full React code, but they should import through a narrow SDK.

```tsx
import { Badge, Button, Chart, Table, useMiniappTools } from "@t3work/miniapp-sdk";

export default function App() {
  const tools = useMiniappTools();

  async function refresh() {
    const status = await tools.git.status();
    const artifacts = await tools.artifact.list({ kind: "health-report" });
    return { status, artifacts };
  }

  return <Button onClick={refresh}>Refresh</Button>;
}
```

The SDK should expose:

- stable host context (the same surface-typed reactive Context primitive defined in
  [Epic 16 — Context: Reactive Queryable Surface](./16-action-recipes.md#context-reactive-queryable-surface);
  field access in a miniapp is a subscription, identical to recipe discovery)
- declared tool bridge
- shell design system components
- visualization components
- animation/interactivity helpers
- artifact/resource link helpers
- placement-aware layout primitives

Useful component families to whitelist over time:

- core controls: buttons, inputs, menus, tabs, dialogs
- data display: table, tree, timeline, key-value list, badges
- visualizations: charts, graphs, kanban board, dependency graph, diff viewer
- workflow UI: recipe action, mutation preview, approval panel, artifact picker
- interaction: drag/drop, resizable panels, sortable lists, command palette hooks
- motion: constrained animation primitives that respect shell accessibility settings

Direct access to arbitrary internal app modules should stay blocked. Public miniapp
components should be intentionally exported and versioned through the SDK.

## Tool Access

Miniapps use the **single shared tool surface** — the same `T3workToolBroker` capability
surface consumed by agent turns and workflow steps, scoped by the declared tool groups.
There is no miniapp-specific tool API. The catalog, tool classes, and safety matrix are in
[Epic 21](./21-context-tool-catalog.md); the recipe/workflow side is in
[Epic 16](./16-action-recipes.md).

They do not get raw filesystem, process, credential, or network access by default.
Instead, they call declared tools through the shell:

```ts
await tools.recipe.run({ recipeId: "fix-ci" });
await tools.artifact.create({ kind: "decision-record", body });
await tools.integration.prepareMutation({ ref, action: "comment" });
```

Rules:

- tool calls must be declared in `miniapp.json`
- shell resolves tools from the active workspace and user permissions
- mutation-capable tools keep the same review and approval gates as agent actions
- tool calls should be logged into run or artifact history when they affect workflow state
- broken or denied tool calls fail the miniapp placement, not the whole shell

## Security And Isolation

Miniapps are powerful user/workspace code. They follow the same **two-stage security
model** as recipe scripts, defined in [Epic 16](./16-action-recipes.md#security-two-stages):

- **Stage 1 — Trusted (current):** miniapps are trusted workspace code, evaluated
  client-side. This is what ships first, consistent with project recipes being trusted
  local code in the MVP.
- **Stage 2 — Sandboxed (target):** miniapps run with no ambient capabilities; data and
  actions flow only through host-injected props, the tool bridge, and typed events.

The stage-2 constraints (build toward these now so the transition is "remove the escape
hatches," not a rewrite):

- run miniapps in an isolated runtime, likely a sandboxed iframe or equivalent boundary
- load imports only from `@t3work/miniapp-sdk` and approved runtime shims
- deny arbitrary package installs for the MVP
- deny direct access to browser storage outside the miniapp namespace
- pass data through structured host props and tool results
- View actions emit typed events the workflow runtime handles, rather than calling tools
  directly from the renderer
- enforce timeouts and crash containment per placement
- show manifest permissions before first enablement

The declared tool groups are the single enforcement point: inert under stage 1, enforced
under stage 2.

## Agent Workflow

Miniapps should be created by an explicit workflow or recipe.

Example flow:

1. User asks for a project health miniapp.
2. Agent interviews for placement, data sources, and allowed actions.
3. Agent writes `.t3work/miniapps/project-health/miniapp.json`.
4. Agent writes `App.tsx` using `@t3work/miniapp-sdk`.
5. Agent adds README and example fixtures where useful.
6. Shell validates manifest, imports, and tool declarations.
7. User enables the miniapp for selected placements.

The workflow should avoid hidden creation. The user must know that source files were
added to the workspace.

## MVP Slice

Start with:

- project workspace miniapps only
- home workspace concept stubbed but not required
- `dashboard`, `conversation.inlineCard`, and `conversation.sidecar` placements
- manifest schema and discovery under `.t3work/miniapps`
- SDK exports for core shell components, tables, simple charts, artifact links, and tool bridge
- no arbitrary npm dependencies
- declared tools only
- explicit enablement UI
- agent recipe for creating a miniapp from a short interview

## Open Questions

- Should miniapp files be committed automatically after creation, or only staged for user review?
- How should SDK version compatibility be represented in `miniapp.json`?
- Which visualization library should back the first chart/graph exports?
- Should home workspace miniapps be globally enabled by default, or opt-in per project?
- What is the smallest safe runtime that still supports real React authoring?
