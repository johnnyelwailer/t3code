# Epic 31: Composable Project Views

## Purpose

Make project dashboards and pack-provided work surfaces agent-authorable without giving
agents raw integration access.

The model is **Lego blocks, not raw APIs**. Agents compose safe project views from
shell-owned data hooks, UI blocks, and reviewed actions. The shell keeps ownership of
provider auth, caching, normalization, freshness, permissions, and mutation review.

This epic extends [Epic 19: Workspace Miniapps](./19-workspace-miniapps.md). Miniapps
remain the durable View primitive. This epic defines the block library and delivery plan
needed to let agents and workspace packs recreate and customize Backlog/My Work-style
dashboards. Under [Epic 36](./36-workspace-packs-and-distributions.md), Backlog and My
Work are proof views supplied by a pack, not permanent core product pages.

## Product Vision

A user should be able to say:

> Create a triage dashboard for bugs assigned to my team, grouped by risk, with a side
> panel for planning recipes.

The agent should not call Jira, Tempo, or GitHub directly. It should write a small
project-local view that composes approved blocks:

```tsx
import {
  MetricStrip,
  ProjectView,
  RecipeSection,
  ViewToolbar,
  WorkItemBoard,
  WorkItemFilters,
  WorkItemTable,
} from "@t3work/blocks";

export default function TriageView() {
  return (
    <ProjectView title="Triage">
      <ViewToolbar>
        <WorkItemFilters presets={["bugs", "assigned-to-team", "needs-triage"]} />
      </ViewToolbar>
      <MetricStrip metrics={["openBugs", "unassigned", "blocked"]} />
      <WorkItemBoard query="bugs.needsTriage" groupBy="risk" />
      <WorkItemTable
        query="bugs.needsTriage"
        columns={["key", "title", "status", "assignee", "prs"]}
      />
      <RecipeSection topic="planning" />
    </ProjectView>
  );
}
```

The user reviews the view manifest before enablement:

```json
{
  "id": "triage-dashboard",
  "version": "0.1.0",
  "name": "Triage",
  "scope": "project",
  "entry": "./TriageView.tsx",
  "placements": [{ "type": "project.navView", "title": "Triage" }],
  "blocks": ["ProjectView", "WorkItemFilters", "WorkItemBoard", "WorkItemTable", "RecipeSection"],
  "capabilities": ["workItems.read", "recipes.read", "recipes.run", "threads.read"]
}
```

## Design Principles

1. **Compose first.** Agents arrange approved blocks before writing custom rendering.
2. **No raw connector APIs by default.** Jira, Tempo, GitHub, and future connectors stay
   behind normalized project contracts.
3. **Shell owns data.** Blocks use shell-managed queryables, cache freshness, and tool
   broker permissions.
4. **Views are source artifacts.** Current examples use `.t3work/miniapps/` for
   project-local views. Under Epic 36 this is transitional; generated/synced state should
   move to host app-data, with repo files only for explicitly project-owned source.
5. **Review before enablement.** A generated view is not mounted until the user reviews
   manifest capabilities and placement.
6. **Dogfood with current views.** Backlog and My Work must be expressible through the same
   public blocks that agents and packs use.

## Architecture

Composable project views have four layers.

### 1. Public View SDK

Package target:

```text
packages/t3work-blocks/
```

Export only stable blocks and hooks. Do not export integration clients or unstable app
internals.

Initial hooks:

```ts
useProject();
useWorkItems(query);
useWorkItem(id);
useWorkItemFilters();
useProjectThreads(query);
useRecipeMatches(surfaceOrTopic);
useViewState(key, schema);
```

Initial actions:

```ts
openWorkItem(id);
openThread(id);
setWorkItemFilter(filter);
runRecipe(recipeId, context);
refreshView();
```

Actions route through the same tool broker and review rules as recipes. Provider-specific
mutations stay hidden unless exposed as reviewable high-level actions.

### 2. Block Library

Blocks are shell-owned React components. They handle accessibility, density, loading,
empty states, and error states.

Initial project blocks:

- `ProjectView`
- `ViewToolbar`
- `MetricStrip`
- `WorkItemFilters`
- `WorkItemSearch`
- `WorkItemBoard`
- `WorkItemTable`
- `WorkItemCard`
- `WorkItemDetailPreview`
- `RecipeSection`
- `RecentThreads`
- `ContextAttachmentList`
- `RefreshStatus`

Each block must have Storybook coverage and test fixtures.

### 3. View Manifest

Every project view declares placement, blocks, capabilities, and entrypoint.

```ts
type ProjectViewManifest = {
  id: string;
  version: string;
  name: string;
  scope: "project";
  entry: string;
  placements: ReadonlyArray<{ type: "project.navView"; title: string }>;
  blocks: ReadonlyArray<string>;
  capabilities: ReadonlyArray<ProjectViewCapability>;
};
```

Capabilities are high-level:

- `workItems.read`
- `workItems.filter`
- `workItems.previewMutation`
- `recipes.read`
- `recipes.run`
- `threads.read`
- `threads.create`
- `artifacts.read`
- `artifacts.write`

Not capabilities:

- `jira.raw`
- `tempo.raw`
- `github.rawGraphql`
- `database.raw`

### 4. Runtime Host

The shell owns routing and mounting.

```text
/t3work/projects/:projectId?projectView=backlog
/t3work/projects/:projectId/views/:viewId
```

The host resolves:

1. core/distribution registry views
2. enabled global or remote-managed pack views
3. enabled user-home views
4. enabled project-local views
5. explicit policy locks and user overrides

The host passes a `ProjectViewHostContext` into blocks:

```ts
type ProjectViewHostContext = {
  projectId: string;
  workspaceRoot: string;
  placement: "project.navView";
  surface: string;
  capabilities: ReadonlyArray<ProjectViewCapability>;
};
```

## Transitional View Targets

Backlog and My Work become proof that this model is real. They should be expressible as
pack-provided views using the same public blocks as custom enterprise views.

### Backlog As Blocks

```tsx
export default function BacklogView() {
  return (
    <ProjectView title="Backlog" surface="project.dashboard.backlog">
      <ViewToolbar>
        <WorkItemSearch />
        <WorkItemFilters presets={["board", "sprint", "assignee", "issueType", "focus"]} />
      </ViewToolbar>
      <MetricStrip metrics={["visibleItems", "bugs", "unassigned", "unestimated"]} />
      <WorkItemBoard query="project.backlog" lanes="planning" />
      <WorkItemTable
        query="project.backlog"
        columns={["key", "title", "type", "status", "assignee", "estimate", "prs", "actions"]}
      />
      <RecipeSection surface="project.dashboard.backlog" />
    </ProjectView>
  );
}
```

### My Work As Blocks

```tsx
export default function MyWorkView() {
  return (
    <ProjectView title="My Work" surface="project.dashboard.myWork">
      <ViewToolbar>
        <WorkItemSearch />
        <WorkItemFilters presets={["assignedToMe", "needsMyAction", "status"]} />
      </ViewToolbar>
      <MetricStrip metrics={["assignedToMe", "needsReview", "blocked"]} />
      <WorkItemBoard query="workItems.myWork" groupBy="status" />
      <WorkItemTable
        query="workItems.myWork"
        columns={["key", "title", "status", "prs", "updated"]}
      />
      <RecipeSection surface="project.dashboard.myWork" />
    </ProjectView>
  );
}
```

## Delivery Waves

### Wave 0: Align The Contract

Goal: make the vision explicit and remove naming drift.

Tasks:

- Add `ProjectViewCapability` and `ProjectViewManifest` schemas.
- Document that project custom views use blocks and high-level capabilities.
- Add a registry shape for current and pack-provided project views.
- Keep current Backlog and My Work behavior unchanged.

Acceptance:

- Type-level manifest schema exists.
- Existing dashboards still mount through current route.
- Tests cover manifest validation.

### Wave 1: Extract Public Blocks From Existing Dashboards

Goal: create reusable blocks without moving dashboards yet.

Tasks:

- Extract `WorkItemTable` public wrapper from current backlog table pieces.
- Extract `WorkItemBoard` public wrapper from current kanban/planning pieces.
- Extract `WorkItemFilters` from backlog and my-work filter state.
- Extract `RecipeSection` from current sidecar recipe sections.
- Add Storybook stories for loading, empty, dense, error, and mobile-ish states.

Acceptance:

- Existing Backlog and My Work use at least `WorkItemTable`, `WorkItemBoard`,
  `WorkItemFilters`, and `RecipeSection`.
- No block imports integration clients.
- `vp test`, `vp run typecheck`, and additive guard pass.

### Wave 2: Existing Views Use The Same Registry

Goal: make Backlog and My Work look like registered views internally.

Tasks:

- Add internal registry entries for `backlog` and `my-work`.
- Route project view selection through the registry.
- Keep implementation source in app code for now.
- Surface each registered view's manifest in diagnostics/dev UI.

Acceptance:

- `projectView=backlog` resolves through registry.
- `projectView=my-work` resolves through registry.
- Sidebar/dashboard nav reads registered view metadata.
- No user-visible behavior change.

### Wave 3: Project-Local Trusted Views

Goal: enable a project-local view proof without sandboxing.

Tasks:

- Discover `.t3work/miniapps/*/miniapp.json` with `project.navView` placement.
- Validate manifest capabilities and block names.
- Add enable/disable review UI.
- Mount trusted project-local view modules in development/managed workspaces.
- Add fallback UI for missing entry, invalid manifest, and runtime render failure.

Acceptance:

- A sample `.t3work/miniapps/triage-dashboard` appears in project nav after enablement.
- Invalid raw provider capability is rejected.
- Render failure breaks only that view, not the shell.
- User can disable the view.

### Wave 4: Recreate My Work As Project-Local View

Goal: first dogfood migration.

Tasks:

- Implement a `.t3work/miniapps/my-work` equivalent using public blocks.
- Compare behavior against current in-app My Work.
- Fill missing block capabilities rather than importing app internals.
- Keep current in-app My Work as fallback during migration.

Acceptance:

- Project-local or pack-provided My Work can replace current My Work behind a feature flag.
- Block gaps are documented or closed.
- Browser click-through covers filter, board/table switch, recipe launch, and ticket open.

### Wave 5: Recreate Backlog As Project-Local View

Goal: prove the harder dashboard.

Tasks:

- Implement `.t3work/miniapps/backlog` equivalent using public blocks.
- Support board/sprint/filter selection, table columns, planning lanes, hierarchy,
  GitHub activity, and recipe sidecar.
- Keep mutations as high-level reviewed actions.
- Treat the resulting view as the candidate entry for an external Atlassian/work-management
  pack.

Acceptance:

- Project-local or pack-provided Backlog can replace current Backlog behind a feature flag.
- No raw Jira/Tempo/GitHub imports.
- Existing backlog tests remain green or move to block-level tests.
- Browser click-through covers search, filters, board/table/planning modes, drag/move if
  enabled, recipe launch, and ticket open.

### Wave 6: Agent View Authoring Recipe

Goal: agents create useful custom views from blocks.

Tasks:

- Add a `create-project-view` recipe.
- Agent interviews user for goal, data slice, layout, and actions.
- Agent writes manifest and view source.
- Agent runs typecheck/preview loop.
- User reviews manifest and enables view.

Acceptance:

- Agent can create a simple triage dashboard from one prompt.
- Generated view uses only `@t3work/blocks`.
- Preview catches broken imports/props before enablement.
- User can edit or delete the view from project settings/manager.

### Wave 7: Sandboxing And Sharing

Goal: move from trusted proof to product-ready extension system.

Tasks:

- Run project-local views in isolated runtime or sandboxed iframe.
- Restrict storage to view namespace.
- Add SDK version compatibility checks.
- Support promotion to user-home workspace.
- Add import/export or marketplace-like sharing later.

Acceptance:

- A broken or malicious view cannot access shell storage or raw credentials.
- Capabilities are enforced at runtime, not only by manifest review.
- Shared views require explicit trust/enablement per workspace.

## Safety Model

Project views get high-level capability tokens. Blocks and hooks check tokens before
reading or acting.

Example:

```ts
useWorkItems("project.backlog"); // requires workItems.read
setWorkItemFilter(...); // requires workItems.filter
runRecipe(...); // requires recipes.run
```

Provider access remains in server/tool broker layers. A block can request normalized work
items; it cannot fetch arbitrary Jira issues unless the shell exposes that as a safe
query.

## Authoring Rules For Agents

When creating a view, the agent must:

1. Interview the user for purpose, audience, data slice, layout, and allowed actions.
2. Prefer existing blocks over custom components.
3. Use only public `@t3work/blocks` and `@t3work/sdk` imports.
4. Declare all capabilities in the manifest.
5. Run typecheck and preview.
6. Ask the user to review and enable the view.

The agent must not:

- import app internals from `apps/web/src`
- import provider clients
- embed credentials
- create or enable the view silently
- widen capabilities after user approval without a new review

## Working Decisions

- Backlog and My Work should move out of core into an Atlassian/work-management pack as
  soon as the pack loading path can carry them. Temporary distribution/core registry
  entries are allowed only as migration scaffolding, not as the target architecture.
- Pack-installed views do not copy into project workspaces. Project-local views are
  explicitly authored project code, not installed pack code.
- v1 assumes trusted view code. Sandboxing remains a later hardening track for untrusted
  marketplaces or arbitrary third-party code, not a blocker for trusted packs.
- View state must declare ownership. Per-user state is the default for layout, filters, and
  hides/pins; per-project state is allowed only when the view declares shared state and the
  user approves the write.
- Generated views are never auto-committed. The workflow writes a draft or unstaged files,
  shows a diff, and leaves commit/stage decisions to the user.
- Explicitly project-owned view source follows the project-local storage decision in Epic
  36; pack-installed views stay in host app-data.

## First Milestone

The first milestone is intentionally small:

1. Extract blocks.
2. Register current Backlog/My Work through the same registry used by packs.
3. Create one project-local trusted `triage-dashboard`.

This proves the direction without giving agents raw integration access.
