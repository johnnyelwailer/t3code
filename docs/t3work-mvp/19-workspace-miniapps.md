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
- `sidecar.section`: a labeled, composable group rendered inside the right-side
  **sidecar** (the contextual panel — distinct from the left navigation sidebar).
  The canonical place for sidecar content — topic-grouped recipe sections (Filters,
  Quick actions, QA, Refinement, …), open-items lists, recent threads, status widgets,
  and anything else the user discovers from the sidecar are all sections at this placement.
  See [Sidecar Sections](#sidecar-sections).
- `action`: recipe launcher in a dedicated action list. Typically
  rendered inside a `sidecar.section` miniapp that aggregates recipe launchers.
- `action.inline`: inline action chip embedded within an existing page's control chrome
  (e.g., a filter chip on the backlog page). Used by deterministic recipes whose workflow
  contains no `agent` step — clicking executes a `tool`/`script` workflow synchronously
  without opening a chat. See
  [Epic 16 — Deterministic Workflows](./16-action-recipes.md#deterministic-workflows-no-chat).
- `conversation.inlineCard`: compact renderer inside an agent conversation.
- `conversation.sidecar`: interactive side panel beside a conversation.
- `artifact.detail`: custom artifact detail renderer.
- `workspace.sidecar`: unlabeled compact widget pinned in the sidecar chrome (e.g., a
  sticky build/sync indicator). For _labeled, composable_ sidecar groups, use
  `sidecar.section`. (Renamed from `workspace.sidebar` to avoid colliding with the
  left navigation sidebar; the old name is retained as an alias during transition.)
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
    | "sidecar.section"
    | "action"
    | "action.inline"
    | "conversation.inlineCard"
    | "conversation.sidecar"
    | "artifact.detail"
    | "workspace.sidecar"
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

## Sidecar Sections

The right-side contextual panel (the **sidecar** — distinct from the left navigation
"sidebar" in t3work's vocabulary) is a **composition of topic-grouped sections**, not a
single monolithic recipe list. Each section is a miniapp at the `sidecar.section`
placement; the shell composes them in an order that profile and project defaults (and
user overrides) configure. There is no shell-special-cased content in the sidecar —
Filters, Quick actions, QA, Refinement, Planning, Engineering, Delivery, Customize,
Recent, and any future category are all sections built on the same primitive.

Two orthogonal axes drive what appears:

1. **Interaction type** — view action vs chat starter vs hybrid. Drives click behavior
   (derived from recipe workflow shape and section `component`, not from topic).
2. **Topic** — **required** on every bundled and project-local recipe. One topic per
   recipe; determines which section group it appears under. Topics are flat peers — no
   topic is architecturally special or a catch-all fallback.

**Section visibility:** a topic section renders **only when it has at least one matched,
visible action**. After recipe discovery and matching, items are bucketed by
`recipe.topic`; empty buckets are skipped (auto-hide). The `recent` section follows the
same rule — hide when there are no recent threads.

This removes earlier hardcoded headers from the side panel (e.g. the
`ProjectDashboardKickoffAside.tsx` "Kick off a project thread / Start a focused
conversation for &lt;project&gt; and continue it in full thread view" block). That
intent is now expressed by whichever sections the active profile composes — the shell
chrome carries no recipe-specific copy.

### Topic catalog

Every recipe **must** declare `topic`. Section id typically matches topic id (1:1).

| Topic id        | Section title | What belongs here                       | Examples                                       |
| --------------- | ------------- | --------------------------------------- | ---------------------------------------------- |
| `filters`       | Filters       | Narrowing what you see on the board     | Assigned to me, needs my action, clear filters |
| `quick-actions` | Quick actions | Simple, everyday conversation starters  | Explain simply                                 |
| `qa`            | QA            | Verification and acceptance             | Review AC, QA test plan                        |
| `refinement`    | Refinement    | Early shaping — stories, epics, sizing  | T-shirt-size epic, shape backlog slice         |
| `planning`      | Planning      | Sprint/commitment — capacity, tasks, assignments, scope | Estimate/split/assign, unassigned, overbooked, sprint fit |
| `engineering`   | Engineering   | Implementation work                     | Technical plan, PR feedback                    |
| `delivery`      | Delivery      | Unblock, handoff, coordination          | Unblock blocked ticket                         |
| `customize`     | Customize     | Personalize workspace / extensions      | Create contextual recipe, edit-plugin-module   |
| —               | Recent        | *(not a recipe topic — thread utility)* | —                                              |

**Refinement vs Planning** are different stages, not interchangeable:

| Topic        | When                                              | Examples                                              |
| ------------ | ------------------------------------------------- | ----------------------------------------------------- |
| Refinement   | Early — shaping work before commitment            | T-shirt-size epic, shape backlog slice, story writing |
| Planning     | Later — planning day, sprint fit, who does what   | Estimate/split/assign, unassigned, overbooked, sprint scope moves |

T-shirt-size and epic shaping stay **refinement**. Estimate-a-story + split-into-tasks +
assign is **planning**.

**Honest scope:** engineering and refinement examples are the most validated in the
bundled catalog. QA, planning, delivery, and customize topics use the same mechanical
model but need recipes and copy reviewed by people in those roles — do not treat the
bundled catalog as complete for non-engineering roles until reviewed.

### Section catalog

| Section id      | Title         | Component              | Matches `topic` |
| --------------- | ------------- | ---------------------- | --------------- |
| `filters`       | Filters       | `inline-filters`       | `filters`       |
| `quick-actions` | Quick actions | `recipe-list`          | `quick-actions` |
| `qa`            | QA            | `recipe-list`          | `qa`            |
| `refinement`    | Refinement    | `recipe-list`          | `refinement`    |
| `planning`      | Planning      | `recipe-list`          | `planning`      |
| `engineering`   | Engineering   | `recipe-list`          | `engineering`   |
| `delivery`      | Delivery      | `recipe-list`          | `delivery`      |
| `customize`     | Customize     | `recipe-list`          | `customize`     |
| `recent`        | Recent        | `recent-conversations` | —               |

Only mechanical difference: the `filters` topic uses the `inline-filters` component
(view actions with Apply / optional Rank next); all other recipe topics use `recipe-list`
(chat starters that stage a kickoff chip). **Same grouping rules for every topic.**

**Profile and project composition** affects **order and collapse only** — not which
section ids exist and not role gates. All bundled profiles share the same section id
catalog; an empty section slot never renders regardless of composition order.

```ts
sidecarSections: {
  sections: [
    { sectionId: "filters" },
    { sectionId: "quick-actions" },
    { sectionId: "qa" },
    { sectionId: "refinement" },
    { sectionId: "planning" },
    { sectionId: "engineering" },
    { sectionId: "delivery" },
    { sectionId: "customize" },
    { sectionId: "recent", collapsed: true },
  ],
}
```

Profiles may reorder (e.g. put `planning` before `refinement`) or collapse `filters`.
`customize` is usually last or collapsed until needed.

**Project manifest wiring:** project setup persists `sidecarSections` into
`.t3work/setup/profile.json`. `T3workSidecarComposition` merges
`bundled → profile → project → user` via `projectDefault?: SidecarComposition`.
Kickoff panels read synced `agentSetup.sidecarSections` with
`readProjectSidecarCompositionFromProject` (`t3work-createProjectBootstrap.ts`) and pass
the result as `projectDefault` from `ProjectDashboardKickoffAside` and
`TicketKickoffPanel` (covered by `t3work-createProjectBootstrap.test.ts`).

### Launcher rules (section component drives clicks)

Section `component` drives per-item click behavior; section `id` / title is topical
presentation only:

```text
onSectionItemClick(sectionDefinition, item, action):
  if sectionDefinition.component === "inline-filters":
    if action === "rank-next": stageKickoff(rankNextRecipeFor(item))
    else: executeDeterministic(item)
  elif sectionDefinition.component === "recipe-list":
    stageKickoff(item)
```

`recipe-list` sections (QA, Quick actions, Refinement, Planning, etc.) share identical
card → `stageKickoff` behavior. The `recent` section navigates to threads on click.

### Storybook-first UI iteration

Storybook is set up for `t3work` sidecar and recipe presentation. Build and review section
chrome in isolation before full dashboard wiring.

- Config: `apps/web/src/t3work/storybook/t3work-storybook-main.ts`
- Dev: `pnpm storybook` from repo root
- Static build: `pnpm storybook:build`
- Stories colocated: `apps/web/src/t3work/**/*.stories.tsx`
- Sidecar fixtures: `apps/web/src/t3work/t3work-sidecarStoryFixtures.ts`

Existing sidecar stories: `RecipeListCard`, `FilterActionCard`, `TopicSection`,
`SidecarComposition` (engineering + QA fixture variants).

Workflow per feature: add/update story states (default, empty, populated) → implement
component → wire into `T3workSidecarComposition` → unit test click paths. Recipe
**logic** (matching, topics) stays in tests; recipe **presentation** (cards, sections,
spacing) lives in Storybook for fast iteration.

### `defineSidecarSection` SDK primitive

Sections are authored as a peer to recipes — the recipe abstraction stays focused on
_launchable workflows_, and "render a list / chip group / status widget in the sidecar"
fits better as its own primitive that shares the same four core primitives underneath
(Context, Tools, Workflows, Views).

Phase 5a ships the stage-1 trusted variant: `title` is a static string and `component`
is a shell-registered React component key. Function-typed titles and compiled `view`
module paths are deferred to the miniapp runtime phase.

```ts
// @t3work/sdk
import { defineSidecarSection } from "@t3work/sdk";

// Example: a recipe-list section (most topics)
export default defineSidecarSection({
  id: "quick-actions",
  version: "1.0.0",
  title: "Quick actions",
  shortDescription: "Everyday conversation starters for the current view",
  surfaces: ["project.dashboard.backlog", "project.dashboard.myWork", "workitem.detail.sidepanel"],
  component: "recipe-list",
  topicFilter: ["quick-actions"],
  allowedToolGroups: ["view.state", "thread.handoff"],
  defaults: { collapsed: false, visible: true },
});

// Example: filters section (view actions)
export default defineSidecarSection({
  id: "filters",
  version: "1.0.0",
  title: "Filters",
  component: "inline-filters",
  topicFilter: ["filters"],
  allowedToolGroups: ["view.state"],
  defaults: { collapsed: false, visible: true },
});
```

A section's View receives the render context (per [Epic 16 — Context](./16-action-recipes.md#context-reactive-queryable-surface))
and renders matched recipes for its `topicFilter`. Click behaviors follow the
[launcher rules](#launcher-rules-section-component-drives-clicks) above — section
`component` is authoritative, not per-recipe hacks in the shell.

### Shell vs section ownership

| Shell-owned (chrome)                                  | Section-owned (content)                       |
| ----------------------------------------------------- | --------------------------------------------- |
| Section header label + icon                           | What's inside the section                     |
| Collapse / expand toggle (state persisted per user)   | The item list / chip group / widget           |
| Drag handle for reorder                               | Click behaviors per item                      |
| Show/hide affordance (per profile, per user override) | Inline controls (search input, sort, refresh) |
| Empty-state container                                 | What "empty" actually means and its CTA       |
| Loading skeleton conventions                          | Data subscription via `Queryable<T>`          |
| Section-level error fallback                          | Item-level errors and recovery                |

Same shell/miniapp split as other placements — the shell owns the slot, the section
owns its content. Stage-2 sandboxing applies identically.

### Composition model

```ts
type SidecarComposition = {
  sections: ReadonlyArray<{
    sectionId: string;
    visible?: boolean; // default from defineSidecarSection.defaults.visible
    collapsed?: boolean; // default from defineSidecarSection.defaults.collapsed
  }>;
};

type SidecarPersonalization = {
  composition?: SidecarComposition;
  itemHides?: Record<string, ReadonlyArray<string>>;
  itemPins?: Record<string, ReadonlyArray<string>>;
  itemOrderOverrides?: Record<string, ReadonlyArray<string>>;
};
```

Defaults come from the active profile ([Epic 12](./12-profiles-and-skill-packs.md)) —
all profiles share the same section id catalog; profile `sidecarSections` sets **order
and collapse** only. Per-user overrides (reorder, collapse, hide) persist via a sibling
client-settings key
(`t3workStoredSidecarCompositionJson`; `packages/contracts/src/settings.ts` is already
on the additive guard allowlist). The same payload now carries per-section hidden item
ids, pinned item ids, and explicit item-order overrides.

### Topic sections are peers, not a monolith

The legacy **Quick Starts** bundled section (all recipes in one list) is being replaced
by topic-grouped sections. Each topic is a `defineSidecarSection` with `recipe-list` or
`inline-filters` component. Sections are removable (user/profile can hide a slot) and
replaceable (a project can ship its own section with the same id to override). The
[launcher rules](#launcher-rules-section-component-drives-clicks) and
[Epic 16 — Launcher UX by workflow shape](./16-action-recipes.md#launcher-ux-by-workflow-shape)
apply per section component, not to the side panel as a whole.

**Sidebar shape is emergent:** e.g. ticket + QA profile → Filters + QA + Quick actions;
epic + engineer → Filters + Refinement + Quick actions.

### Example sections

Each of these is a miniapp at `sidecar.section` — built-in, bundled, or project-local:

**Topic-grouped recipe sections (bundled default catalog):**

- **Filters** — `inline-filters`; view actions (assignee narrowing, needs-my-action, clear)
- **Quick actions** — everyday chat starters
- **QA**, **Refinement**, **Planning**, **Engineering**, **Delivery**, **Customize** —
  `recipe-list` sections bucketed by `recipe.topic`
- **Recent** — `recent-conversations`; recently active threads

**Future / skill-pack sections (same primitive, different data sources):**
- **Open Pull Requests** — assigned / review-requested PRs, click navigates to PR workspace
- **My Open Tickets** — Jira issues assigned to the user
- **Saved Filters** — the Jira-side saved-filter library
- **Pinned Workflows** — user favorites across recipes
- **Drafts** — pending mutation drafts awaiting commit
- **Status Widgets** — health / build / sync indicators

Skill packs and project workspaces contribute sections the same way they contribute
recipes — a `defineSidecarSection` plugin module discovered alongside `recipes/` (see
[Epic 16 — Plugin Modules](./16-action-recipes.md#plugin-modules) for the discovery
pattern; sections live under `<workspace>/.t3work/sections/<id>/section.ts`).

### Context menus

The sidecar can accumulate many sections and many items per section. To keep the user
in control without proliferating settings panels, every section item and every section
header exposes a **context menu**: right-click _and_ a kebab (`⋮`) icon revealed on hover.
Both gestures open the same menu — kebab for discoverability, right-click for power
users.

The menu chrome is **shell-rendered and uniform across sections**. Sections contribute
their own item-specific actions via the SDK; the shell merges universal actions with
section-declared actions into one menu.

#### Item-level actions

Right-click / kebab on an individual item (recipe card, filter row, inline chip, PR row, etc.):

| Action                 | Source    | Scope    | Notes                                                                                                                                                   |
| ---------------------- | --------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Edit this…**         | Universal | per-user | Only shown for project-local items with a resolvable source path. Launches the canonical `edit-plugin-module` workflow with that source preselected.    |
| **Customize…**         | Universal | per-user | Only shown when the item has user-specific hide/pin/order overrides. MVP routes this through a guided reset workflow rather than a broader settings UI. |
| **Hide item**          | Universal | per-user | Item never shows for this user. Persisted in `t3workStoredSidecarCompositionJson` under `itemHides`. Per-project hide remains **deferred**.             |
| **Pin to top / Unpin** | Universal | per-user | Boosts the item above its natural rank within its section. Persisted in the same settings payload under `itemPins` / `itemOrderOverrides`.              |
| _section-specific_     | Section   | varies   | E.g., "Apply filter now" on a filter item. Declared via `defineSidecarSection.itemActions` and launched through the no-chat workflow path. |

#### Section-level actions

Right-click / kebab on a section header:

| Action                | Source    | Scope    | Notes                                                                                                                                       |
| --------------------- | --------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Hide section**      | Universal | per-user | Persisted in `t3workStoredSidecarCompositionJson`.                                                                                          |
| **Collapse / expand** | Universal | per-user | Also reachable via the section header chevron.                                                                                              |
| **Move up / down**    | Universal | per-user | Keyboard-friendly alternative to drag-to-reorder.                                                                                           |
| **Reset section**     | Universal | per-user | Shown only when the section has user overrides. Runs the same guided reset flow and clears section + item personalization for that section. |
| _section-specific_    | Section   | varies   | Declared via `defineSidecarSection.sectionActions` when a section has them.                                                                 |

Phase 5a.2 originally stopped there. Phase 5c adds **Edit this…** for project-local
items with resolvable source paths plus the guided **Customize…** / **Reset section**
reset flows. Broader customize/settings/recent-runs entries remain deferred until
their backing workflows and settings surfaces exist.

#### SDK hooks on `defineSidecarSection`

Sections opt into the merged menu by declaring action contributors:

```ts
defineSidecarSection({
  id: "open-pull-requests",
  // ...
  itemActions: (item) => [
    {
      id: "open-pr",
      label: "Open in PR workspace",
      icon: "external-link",
      run: { kind: "tool", toolName: "t3work.github.open_pull_request", input: { id: item.id } },
    },
    {
      id: "mark-reviewed",
      label: "Mark as reviewed",
      icon: "check",
      run: { kind: "tool", toolName: "t3work.github.mark_reviewed", input: { id: item.id } },
    },
  ],
  sectionActions: () => [
    {
      id: "refresh",
      label: "Refresh now",
      icon: "refresh-cw",
      run: { kind: "tool", toolName: "t3work.github.refresh_activity_context" },
    },
  ],
});
```

Each `run` is a small **workflow** — usually a single `tool` or `script` step. Click an
action → workflow launches via the deterministic-workflow path (no chat). The action
contract is identical to a deterministic recipe; there is no separate "action execution"
runtime.

#### Persistence

The 5a persistence seam stores composition overrides in a sibling client-settings key —
no new allowlist entries beyond the already-allowlisted `packages/contracts/src/settings.ts`
schema change:

```ts
// t3workStoredSidecarCompositionJson
type SidecarPersonalization = {
  composition?: SidecarComposition; // section visibility + order + collapse
  itemHides?: Record<string, ReadonlyArray<string>>;
  itemPins?: Record<string, ReadonlyArray<string>>;
  itemOrderOverrides?: Record<string, ReadonlyArray<string>>;
};
```

Layering: `bundled defaults → profile defaults → project config → user overrides`.
Higher layers override lower. Hidden items don't render; pinned items render first; the
section's natural order fills the rest.

#### What's not in MVP

- **Per-project hide.** Coupled to the shared-meta-repo story — meta repositories are
  personal today but may become hosted/shared in the future. Until that model
  stabilizes, hide is per-user only. Per-project hide is a follow-up.
- **Developer-mode actions** (Open source, Duplicate as new recipe, View dependencies).
  Deferred. Likely arrives as a `t3work.developerMode` setting that toggles a separate
  set of universal actions.
- **Confirmation dialogs.** Intentionally not used. Destructive operations route through
  the **Customize** action, which launches a guided workflow (preview + approval via
  `present-message` + `collect-input`) rather than a one-shot modal. Same architecture
  pattern as `edit-plugin-module`. No ad-hoc confirmation UI surface.

#### Future: `defineContextAction`

The current model has two action sources — universal (shell) and section-declared
(per `defineSidecarSection`). A natural future helper is **`defineContextAction`**: a
plugin-module export that contributes a single action targeting items matching a
predicate, applied across _any_ section that hosts qualifying items. Example:

```ts
// A QA skill pack could contribute a universal "Convert to bug" action:
defineContextAction({
  id: "convert-to-bug",
  label: "Convert to bug",
  appliesTo: (item, ctx) => item.kind === "jira.issue" && item.type !== "Bug",
  run: defineWorkflow({
    /* ... */
  }),
});
```

This generalizes cross-cutting actions without forcing each section to enumerate them.
Not in MVP — listed in [Plugin SDK Surface](#plugin-sdk-surface) as a planned helper
for when concrete cross-section actions emerge.

## Plugin SDK Surface

The `@t3work/sdk` exposes a small set of **`define*` helpers**, one per
contribution kind. Each helper carries its own typed shape — no generic miniapp
primitive, no string-keyed placement options bag. Authors pick the helper whose name
matches the surface and role they're targeting; the type system enforces correctness
per surface.

### Naming principle

Every `define*` name communicates **surface + role**, not a generic verb. When in doubt,
add a qualifier from the t3work surface vocabulary (`sidecar` / `workitem` / `dashboard` /
`nav` / `artifact` / `conversation` / `commandPalette`). Drift to overly-generic names
(`defineSection`, `defineBlock`, `definePanel`) creates the exact ambiguity these helpers
exist to prevent.

### Three categories

**Launchable behavior** (workflows + how they appear)

| Helper           | What it contributes                                                                       | Status            |
| ---------------- | ----------------------------------------------------------------------------------------- | ----------------- |
| `defineRecipe`   | Launchable workflow + metadata + optional launcher view. The thing most authors write.    | Built (Phase 1-2) |
| `defineWorkflow` | Standalone workflow document, usable inline in a recipe or referenced from `workflow.ts`. | Built (Phase 2)   |

**UI contributions** (placed views — each typed to its surface)

| Helper                            | Placement                                                                                                           | Typical use                                                                                                                                                                                                                                                                            | Status              |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `defineSidecarSection`            | `sidecar.section`                                                                                                   | Labeled group in the right contextual sidecar (Filters, topic-grouped recipe lists, Recent, PR lists, Status Widgets)                                                                                                                                                                    | Built (Phase 5a)    |
| `defineWorkItemSection`           | `workitem.detail.section`                                                                                           | Section inside a work-item detail page (e.g., "Risk Assessment" between Description and Comments)                                                                                                                                                                                      | Planned (Phase 5+)  |
| `defineDashboardWidget`           | `dashboard.widget`                                                                                                  | Widget tile inside a project dashboard (backlog overview, my-work overview)                                                                                                                                                                                                            | Planned (Phase 5+)  |
| `defineNavSection`                | `nav.section`                                                                                                       | Section inside the left navigation tree (e.g., a "Saved Filters" subtree)                                                                                                                                                                                                              | Planned (Phase 5+)  |
| `defineHomeBlock`                 | `home.block`                                                                                                        | Block on the home workspace                                                                                                                                                                                                                                                            | Planned (Phase 5+)  |
| `defineCommandPaletteContributor` | `commandPalette.result`                                                                                             | Adds entries / categories to the command palette. (Sibling surface: composer `/` typeahead — for MVP that uses the recipe-local `slashAlias` field instead of this helper. See [Epic 16 — Composer slash-command launchers](./16-action-recipes.md#composer-slash-command-launchers).) | Planned             |
| `defineArtifactRenderer`          | `artifact.detail`                                                                                                   | Custom viewer for a specific `artifact.kind`                                                                                                                                                                                                                                           | Planned             |
| `defineConversationCard`          | (embedded as view attachment on a system message — see [Epic 16 — Attachments](./16-action-recipes.md#attachments)) | Declarative card spec (checklist / form / approval / etc.); replaces inline card literals                                                                                                                                                                                              | Planned (Phase 5)   |
| `defineConversationSidecar`       | `conversation.sidecar`                                                                                              | Interactive side panel beside a conversation                                                                                                                                                                                                                                           | Planned (Phase 5+)  |
| `defineAction`                    | `action`                                                                                                            | Recipe launcher in a dedicated action list (usually rendered inside a `recipe-list` sidecar section)                                                                                                                                                                                   | Planned (Phase 5)   |
| `defineInlineAction`              | `action.inline`                                                                                                     | Inline action chip in a host page's control chrome (deterministic workflows — see [Epic 16](./16-action-recipes.md#deterministic-workflows-no-chat))                                                                                                                                   | Planned (Phase 3-5) |
| `defineContextAction`             | (universal context menu — see [Context menus](#context-menus))                                                      | A cross-cutting action that targets items matching a predicate across any section — for cross-section verbs that shouldn't have to be re-declared per section                                                                                                                          | Planned (Phase 5+)  |

**Data, capability, and config** (project- or pack-level contributions)

| Helper               | What it contributes                                                                                                       | Status  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------- |
| `defineTool`         | Custom tool registered with `T3workToolBroker` (project-local or pack-bundled). Today tools are only built-in.            | Planned |
| `defineSkillPack`    | Bundle of recipes + sections + profile defaults + tool grants under one id ([Epic 12](./12-profiles-and-skill-packs.md)). | Planned |
| `defineProfile`      | A starter profile with preference fields. Today profiles are hardcoded; this makes them authorable.                       | Planned |
| `defineResourceType` | Typed resource shape + renderer (for new integration providers).                                                          | Planned |

### No generic primitive

There is intentionally **no `defineMiniapp` or `definePlacement` escape hatch in the
public SDK**. Adding a new placement is an explicit, type-safe event: ship a new helper
in the SDK with its own typed shape. The helper count tracks the (small, finite) set of
real surfaces in the t3work UI — bounded growth, no string-literal landmines.

### Multi-placement miniapps via multiple exports

A miniapp that surfaces at _more than one_ placement is authored as **multiple
single-placement exports sharing a common view component**. There is no multi-placement
wrapper:

```text
miniapps/project-health/
  App.tsx                     # the shared View component
  dashboard.tile.ts           # default export: defineDashboardWidget({ view: "./App.tsx", ... })
  conversation.card.ts        # default export: defineConversationCard({ view: "./App.tsx", ... })
  conversation.sidecar.ts     # default export: defineConversationSidecar({ view: "./App.tsx", ... })
```

Each file is small (well under the 200 LOC limit per [Epic 02 — Additive Extension Pattern](./02-additive-architecture.md#additive-extension-pattern)),
each export is fully typed for its specific surface, and the `App.tsx` View is shared
via plain import. Discovery walks the directory, loads each module, and registers each
placement contribution independently. There is no "miniapp" entity that needs to
enumerate its placements — each placed contribution is its own atomic registration.

### Where helpers live in code

`@t3work/sdk` is the single SDK package and public import path for these helpers. The
workflow/tool primitives (`defineWorkflow`, `defineTool`, `defineToolGroup`, `defineModel`,
`defineScript`) ship there today (Epic 25). The recipe and placement helpers (`defineRecipe`,
`defineSidecarSection`, `defineDashboardWidget`, etc.) currently live in
`packages/project-recipes` and are surfaced through `@t3work/sdk` so authors have one
import path.

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
import { Badge, Button, Chart, Table, useMiniappTools } from "@t3work/sdk";

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
- load imports only from `@t3work/sdk` and approved runtime shims
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
4. Agent writes `App.tsx` using `@t3work/sdk`.
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
