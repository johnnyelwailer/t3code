# Epic 19: Workspace Miniapps

## Purpose

Miniapps are agent-created React artifacts that render workflow-specific UI inside
`t3work`.

A dashboard is only one render location. The core primitive is the miniapp: a
workspace-owned artifact with a manifest, React entrypoint, declared placements, and
declared tool capabilities.

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

## Placements

Known placements:

- `dashboard`: persistent project or home page location.
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

- stable host context
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

Miniapps should use the same exposed-tool concept as agent workflows.

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

Miniapps are powerful user/workspace code, not trusted core app code.

Required constraints:

- run miniapps in an isolated runtime, likely a sandboxed iframe or equivalent boundary
- load imports only from `@t3work/miniapp-sdk` and approved runtime shims
- deny arbitrary package installs for the MVP
- deny direct access to browser storage outside the miniapp namespace
- pass data through structured host props and tool results
- enforce timeouts and crash containment per placement
- show manifest permissions before first enablement

Later trusted workspaces may loosen some restrictions, but the default should be
capability-gated.

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
