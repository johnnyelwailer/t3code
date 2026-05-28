# Epic 16: Action Recipes

## Purpose

Action recipes are project-scoped, context-aware workflow launchers. They turn a blank
chat into a concrete, repeatable action that is visible in the UI before the user opens a
conversation.

A recipe is not a special one-off feature. It is the first consumer of a small set of
shared primitives that the rest of `t3work` automation, agent interaction, and UI
extensibility are also built on. Get the primitives right and recipes, custom dashboards,
conversation cards, and project-local automation all become the same system viewed from
different angles.

## Core Primitives

Everything in this epic is expressed in terms of four primitives. They are defined once,
in code, and reused everywhere. Avoid inventing recipe-specific parallels to any of them.

| Primitive    | What it is                                                                                                                                                                                                                                       | Owns                       |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------- |
| **Context**  | A read-only snapshot of the world the agent and workflows read. Two depths: a light _render context_ used before launch, and a rich _full context_ available after launch.                                                                       | `packages/project-context` |
| **Tools**    | The single capability surface — the verbs that read or mutate `t3work` and external state. The _same_ surface is consumed by agent turns, workflow steps, and views, scoped by `allowedToolGroups`. See [Epic 21](./21-context-tool-catalog.md). | `T3workToolBroker`         |
| **Workflow** | The core engine: a serializable, persisted, forward-only sequence of typed steps the host interprets. The foundation for all configurable automation and agent interaction.                                                                      | `packages/project-recipes` |
| **View**     | A code-based, interactive UI unit that mounts on any surface — the action list, a conversation message, a dashboard slot, a side panel. Action launchers and conversation cards are both Views. See [Epic 19](./19-workspace-miniapps.md).       | `@t3work/miniapp-sdk`      |

How they interact, in one line:

> A **surface** discovers **recipes** using a render **context** → the user launches one →
> the host builds the full **context**, materializes a **run**, and executes the recipe's
> **workflow** → workflow steps drive the agent, call **tools**, run scripts, and present
> **views**.

"Template" is not a fifth primitive. It is a lifecycle stage: a recipe as _authored_
(with code that derives values from context) versus _rendered_ (concrete values for one
launch). When this document says a recipe is a template, it means the authored form.

## Scope

The first implementation supports project-scoped recipes only. Personal recipes and
company-owned collections are later extensions of the same model, distinguished only by
where the plugin module lives (project workspace vs. home workspace vs. bundled app).

The MVP does not optimize for public-marketplace security. Project recipes are trusted
local code in the first stage; see [Security: Two Stages](#security-two-stages) for how
that evolves.

## Plugin Modules

A recipe is authored as a **TypeScript plugin module**, not a JSON manifest with embedded
expression strings. This is the concrete form of the "shared core primitives, code-based,
no heavy JSON schemas" principle.

```text
recipes/
  qa-test-plan/
    recipe.ts            # default-exports the recipe definition
    action.view.tsx      # a View used as the launcher (optional)
    workflow.ts          # the workflow, if not inlined in recipe.ts (optional)
    prompt.md            # static/templated prompt material (optional)
    files/               # templated payload files (optional)
      test-plan.md
    helpers.ts           # relative helper modules (optional)
    fixtures/            # redacted context fixtures for authoring/tests (optional)
      jira-story.context.json
```

`recipe.ts` default-exports a typed object. Metadata that used to be a template string is
now a plain function of context — fully type-checked, no custom expression language, no
`new Function` evaluator.

```ts
import { defineRecipe, defineWorkflow } from "@t3work/plugin-sdk";

export default defineRecipe({
  id: "qa-test-plan",
  version: "0.1.0",
  scope: "project",
  surfaces: ["workitem.detail.sidepanel"],

  // Metadata is derived from context in code, not via {{ }} expressions.
  displayName: (ctx) => `Create QA plan for ${ctx.workitem?.displayId ?? "selected work"}`,
  shortDescription: "Build a test matrix from current ticket context",
  icon: (ctx) => (ctx.workitem?.type === "Bug" ? "bug" : "clipboard-check"),
  rank: (ctx) => (ctx.workitem?.priority === "High" ? 90 : 50),

  // Visibility is just a predicate over the render context.
  visible: (ctx) =>
    ctx.workitem?.provider === "jira" &&
    (ctx.workitem.type === "Story" || ctx.workitem.type === "Bug"),

  // The launcher View. Defaults to a host-rendered card if omitted.
  view: "./action.view.tsx",

  // The workflow. May be inlined or referenced from ./workflow.ts.
  workflow: defineWorkflow({
    steps: [
      /* ... */
    ],
  }),

  // Capability scope for everything this recipe runs — agent, scripts, and views.
  allowedToolGroups: ["integration.read", "artifact.rw"],
});
```

> **Implementation status.** Today recipes are authored as `recipe.json` with `{{ }}`
> expression strings evaluated by a `new Function` engine
> (`t3work-projectRecipeDiscoveryVisibility.ts`). The TS-module form above is the target.
> Migrating discovery from "parse JSON + eval strings" to "`import()` a typed module" is
> Phase 1 of the delivery plan and deletes the expression engine entirely.

### Supported authoring subset

Recipe modules run server-side on the host Node runtime (Node 24+ for standalone/server;
the bundled Electron runtime on desktop). They must run under Node's built-in type
stripping — no compile/transpile step is shipped for project-local code.

Supported: ESM, type annotations, interfaces/type aliases, generics, `import type`,
relative imports to other recipe `.ts` files, and `node:` built-ins.

Out of scope for the MVP: decorators, `enum`, runtime namespaces, parameter properties,
CommonJS, tsconfig path aliases (`~/foo`, `@/foo`), and any package import that needs
`npm`/`bun install`. Views (`.tsx`) are the exception — they are compiled by the View
runtime, not type-stripped (see [Epic 19](./19-workspace-miniapps.md)).

Authoring rule:

```text
If the code would need TypeScript compilation to change runtime behavior,
it is out of scope for the MVP — except Views, which the View runtime compiles.
```

### Dependency policy

Recipe modules do not declare or install third-party packages. No `package.json` inside a
recipe, no per-project install step, no background dependency resolution. If a capability
is needed repeatedly, expose it as a **Tool** rather than a library import.

## Context: Reactive Queryable Surface

Context is the read substrate that every consumer of the recipe system reads — recipe
discovery (`visible(ctx)`, `displayName(ctx)`, `rank(ctx)`), Views, and workflow steps
(`script`, `agent`, `tool`) all bind the same model. It is not a recipe-specific concept.

This section defines the contract. Surfaces (next section) declare which context shapes
they expose; Discovery uses the contract to evaluate recipes; Views consume the same
queryables as component props; workflow steps consume a snapshot of the same contract at
step start.

### Surface-typed contexts

The context shape varies by surface. Each surface has its own typed context; recipes
declare which surfaces they apply to and TS narrows the `ctx` parameter accordingly:

```ts
type RenderContext =
  | DashboardBacklogContext // surface: "project.dashboard.backlog"
  | DashboardMyWorkContext // surface: "project.dashboard.myWork"
  | WorkItemDetailContext // surface: "workitem.detail.sidepanel"
  | ThreadContext // surface: "thread.context"
  | GithubPullRequestDetailContext // surface: "github.pullRequest.detail.sidepanel"
  | GithubPullRequestDiffSelectionContext
  | GithubReviewCommentContext;
```

A single-surface recipe gets a narrowed context type for free. A multi-surface recipe
narrows by `ctx.surface === "..."` inside `visible`/`displayName`/etc. TS prevents
accessing fields not present on the declared surfaces.

### Queryable contract

Collections in the context are never raw arrays — they are `Queryable<T>` values whose
methods the host backs with the appropriate runtime (Array methods at MVP, indexed SQL
queries at scale). Nested collections (e.g. a backlog item's references) are themselves
`Queryable<T>` all the way down.

```ts
type Queryable<T> = {
  readonly state: "idle" | "loading" | "ready" | "error";
  some(predicate?: (item: T) => boolean): boolean;
  where(predicate: (item: T) => boolean): Queryable<T>;
  count(): number;
  first(): T | undefined;
  // ...
};
```

One polymorphic type covers both eager and lazy collections — a loaded collection is just
a queryable in `state: "ready"`; a lazy one transitions through `idle` → `loading` →
`ready` as needed. Authors don't distinguish; the host owns load policy.

Recipes write code that reads naturally:

```ts
visible: (ctx) =>
  ctx.backlog.items
    .where((i) => i.visibleInCurrentView)
    .some((i) => i.references.some((r) => r.blockedBy != null));
```

The TS types prevent escape: `i.references` is `Queryable<Reference>`, not
`Array<Reference>`. Authors cannot slip into raw `Array.prototype` and break tracking.
Predicates passed to `.some`/`.where` are plain JS — the host traces field access through
them via Proxy.

### Pure functions, Proxy-traced reactivity

Recipes never subscribe to events. `visible` (and metadata derivers like `displayName` and
`rank`) are **pure functions of the context**:

```ts
visible: (ctx: RenderContext) => boolean | VisibilityResult; // preferred: sync, pure
visible: (ctx: RenderContext, api: ReadOnlyToolsApi) => Promise<boolean | VisibilityResult>; // escape hatch
```

**On high-churn surfaces** (`project.dashboard.backlog`, `project.dashboard.myWork`, and
the side-panel action list — anything that updates on every state change), `visible` must
be **synchronous**. A recipe returning a Promise on those surfaces is an authoring error
caught at load time. Async `visible` is reserved for low-churn detail surfaces. Any data
a recipe thinks it needs to fetch should instead arrive in the render context as a
pre-fetched lazy resource (the host loads it; the recipe reads `Queryable<T>` synchronously
with a `pending` visibility while it resolves).

What recipes cannot do: subscribe to events, mutate state, call write tools, depend on
values not in `ctx`.

The runtime makes re-evaluation cheap via **Proxy-traced access tracking**:

- On first evaluation, the host wraps `ctx` (and recursively, every queryable item the
  recipe descends into) in a Proxy that records every path the recipe reads.
- That recorded access set becomes the recipe's memoization key.
- When context changes, the host diffs the change set against each recipe's access set;
  only recipes whose access set intersects the change set re-evaluate.

For 1000 recipes × a search-box keystroke that touches one field, ~5-20 recipes actually
re-evaluate, not 1000. Same mechanism Solid/MobX/Vue reactivity use, applied at the
recipe-and-View boundary.

### Reactivity rule

> If a recipe needs to react to some piece of state, that state must be in the render
> context. Adding a new reactive dimension means adding a field to the render context —
> not giving recipes a subscription API. The render context is the contract.

### Lazy loading and visibility-while-loading

On surfaces where some collections aren't preloaded (e.g. backlog item references when
viewing the backlog list), accessing a `Queryable<T>` in `idle` state triggers an async
load, returns a sentinel result for the current evaluation (`false` / `0` / `undefined`),
and invalidates the dependency when data is ready. The visibility result can express
loading state to the UI:

```ts
type VisibilityResult =
  | boolean
  | { visible: boolean; pending?: boolean; rank?: number; reason?: string };
```

`pending: true` lets the action list show a skeleton or a faint indicator instead of
flickering recipes in and out as data resolves. Only recipes that actually touch lazy
resources pay any load cost, and that cost is shared across all recipes that touch the
same data.

### Backed by the local cache, not by request-keyed HTTP cache

The Queryable runtime is **backed by the existing local SQL persistence layer**, not by
URL-keyed HTTP caches. Both the server and the client (via the server) read from the same
relational store, so rich queries — joins, predicates, aggregates over thousands of items
— compose naturally:

- **Server side** ([apps/server/src/persistence/Layers/Sqlite.ts](apps/server/src/persistence/Layers/Sqlite.ts)
  via `effect/sql` + migrations under `persistence/Migrations/`) is the source of truth.
  Provider integrations (Atlassian, GitHub) sync into namespaced tables; the t3work-specific
  cache layer ([t3work-atlassian-backlog-cacheReadWrite.ts](apps/server/src/t3work-atlassian-backlog-cacheReadWrite.ts))
  already follows this shape.
- **Client side** consumes the same data via server queries and a thin reactive layer that
  subscribes to projection changes. No separate fetch-then-cache; queries are first-class.

`Queryable<T>.where`/`some`/`count` compile to SQL against the local store wherever a SQL
binding is available, and fall back to in-memory iteration otherwise (e.g. for tiny
in-memory derived collections). This is how nested predicates over thousands of items stay
sub-millisecond at scale.

### Reactivity flows through projection invalidation

Reactivity is **event-sourced**, reusing the existing orchestration-events / projection
pipeline. The flow:

1. A tool mutates state (e.g. a Jira ticket update).
2. The mutation lands in SQL; an event is emitted on the orchestration bus.
3. Projection pipeline updates derived tables.
4. The Queryable layer marks affected rows; subscribed consumers (recipe discovery, Views,
   open `collect-input` steps awaiting context-dependent inputs) are notified.
5. The Proxy-traced dependency layer re-evaluates only the consumers whose access set
   intersected the changed rows.

No polling, no stale-while-revalidate guessing, no full-context invalidation. The same
event-sourced model the runtime already uses for thread/message state extends to
recipe/View reactivity.

### Performance budgets

Recipes are evaluated against the published budgets:

- **Discovery (full pass, current surface, warm cache):** < 5 ms p95.
- **Single `visible(ctx)`:** < 100 µs typical. Anything above is a smell — usually a
  predicate iterating a raw collection that should be a queryable.
- **Per-change re-evaluation (typical state change):** < 1-3 ms — only recipes whose
  access set intersects the change.
- **High-churn input (search/filter typing):** caller debounces context update at
  50-150 ms. Discovery does not run per-keystroke.
- **Cold module load:** mtime-cached; one-time cost per process.

A recipe that breaks these budgets is logged as a warning in dev and surfaces in the
debug panel.

### Same model, three consumers

The Context contract is consumed identically by all three places that need data:

| Consumer                                            | Binding                                            | Reactivity                         |
| --------------------------------------------------- | -------------------------------------------------- | ---------------------------------- |
| Recipe discovery (`visible`, `displayName`, `rank`) | UI side, live context                              | Yes — Proxy-traced                 |
| Views (in conversation, dashboards, side panels)    | UI side, live context as props                     | Yes — field access is subscription |
| Workflow steps (`script`, `agent`, `tool`)          | Server side, **snapshot** of context at step start | No — one-shot per step             |

The query API and lazy-resource semantics are identical; recipe and View authors learn
one model. The only difference is that server-side workflow steps read against a snapshot
fixed for the step's lifetime — they don't re-run when data changes mid-step. For
long-running workflows that need to react to data changes mid-run, the runtime exposes
typed events (e.g. `collect-input` can resume on a tool-emitted event), not implicit
re-execution.

## Surfaces

```ts
type ActionRecipeSurface =
  | "project.dashboard.backlog"
  | "project.dashboard.myWork"
  | "workitem.detail.sidepanel"
  | "thread.context"
  | "github.pullRequest.detail.sidepanel" // planned
  | "github.pullRequest.diff.selection" // planned
  | "github.review.comment"; // planned
```

The live MVP surfaces are `project.dashboard.backlog`, `project.dashboard.myWork`,
`workitem.detail.sidepanel`, and `thread.context`. The dashboard split mirrors how the
rest of the system is already partitioned — the tool catalog uses separate
`t3work.backlog.*` and `t3work.my_work.*` namespaces ([Epic 21](./21-context-tool-catalog.md)),
and the React layer renders `ProjectDashboardBacklogView` and `ProjectDashboardMyWorkView`
as distinct pages. Each gets its own typed context; recipes that legitimately span both
declare both surfaces and narrow with `ctx.surface ===`.

Dot-namespacing is hierarchical for ranking and UI grouping purposes only; surface
matching is exact-string. There is no abstract `project.dashboard` parent.

The GitHub surfaces are reserved in the enum but not yet wired; they remain project-scoped
because the GitHub views are rooted in a project-linked repository resource. The next
planned expansion is first-class GitHub PR recipes on the PR detail page, diff selection
menu, and review comment threads.

## Profile-Aware, Not Profile-Name-Aware

The render and full context already include `profile`, so recipes branch on profile
_preferences_, never on profile identity.

Recipes and Views must not branch on `profile.id`, `profile.title`, or any assumed
built-in profile list. They branch on lower-level preference fields:

- `profile.communicationStyle.technicalDepth`
- `profile.communicationStyle.guidanceStyle`
- `profile.communicationStyle.brevity`
- `profile.surfaceDefaults`
- `profile.preferredArtifactKinds`
- `profile.defaultActionFamilies`
- `profile.defaultRecipeWeights`

The same recipe may vary all of these by profile: label and description, rank and
visibility, View copy and call-to-action tone, prompt instructions and expected output
shape, and which sections of a View expand first.

Examples for the same GitHub PR context:

- high technical depth + expert guidance → `Deep review this PR`, diff-heavy, risk framing
- guided density + release/deployment preference → `Explain what changed and what to test`,
  with change buckets, checks, and deployment cues first
- low technical depth + short brevity + summary-first → `Explain customer and rollout impact`

Project recipes may also rely on project-local conventions (PR body templates, required
release-note sections, deployment links and environment names, reviewer guidance).
Projects may ship starter profiles that produce these behaviors, but the engine observes
only the declared preference fields, never the starter profile names.

> Note the one deliberate asymmetry: `profile.defaultRecipeWeights` is keyed by recipe id,
> so a _profile_ may reference _recipes_ by id even though _recipes_ must not reference
> profiles by id. Profiles are app/project configuration; recipes are content.

## Discovery and Pre-Launch Rendering

Recipe actions render before any run exists. The dashboard and side panel need label,
icon, description, rank, and visibility while the user is still browsing. This uses the
light **render context** — the surface-typed reactive context defined in
[Context: Reactive Queryable Surface](#context-reactive-queryable-surface). Each surface
exposes its own typed shape (discriminated by `ctx.surface`); the common fields are:

```ts
// Illustrative — the real types are per-surface, discriminated unions.
// See the Context section for the queryable contract and per-surface shapes.
type RenderContextCommon = {
  surface: ActionRecipeSurface;
  project: ProjectRenderContext;
  profile: ProfileRenderContext;
  enabledSkillPacks: string[];
  // Surface-specific fields live on the surface-typed variants:
  //   DashboardBacklogContext  → { backlog: { items: Queryable<BacklogItem> }, ... }
  //   WorkItemDetailContext    → { workitem: WorkItemDetail, ... }
  //   ...
};
```

Discovery walks the project `recipes/` directory, loads each plugin module, filters by
surface, evaluates `visible`, and renders metadata. Failures are isolated:

- A recipe whose module fails to load or whose `visible`/metadata throws is dropped from
  the list — it never breaks the page or the other recipes.
- `visible` runs under a time budget (~1–2s); a timeout hides only that recipe.
- Diagnostics for dropped recipes surface in an advanced/debug surface, not inline.

`visible` should be fast and effectively side-effect-free. It may read context and call
read-only tools, but it must not perform writes or long IO. (See the binding note under
[Tools](#tools) for how pre-launch code gets a no-thread, read-only tool surface.)

### Bundled vs. project-local recipes

Bundled recipes (shipped with the app, enabled by skill packs) and project-local recipes
are the **same concept with different sources**. Bundled recipes are matched against the
render context by the recipe matcher; project-local recipes are discovered from the
workspace directory. A project-local recipe whose id matches a bundled one inherits the
bundled visibility/rank unless it declares its own. The long-term goal is a single
discovery path over a single recipe type, regardless of source.

## Conversation Participants

A conversation has **three message authors**: `user`, `agent`, and `system`. The third
author is what lets a workflow speak in the conversation as itself rather than ventriloquise
through `user` or `agent` messages — which is the bug that today's "workflow-injected
prompt rendered as a user message" pattern creates. System messages are first-class in the
conversation history; they are not a separate activity timeline.

```ts
type ConversationMessage = {
  id: MessageId;
  threadId: ThreadId;
  author:
    | { kind: "user" }
    | { kind: "agent"; agentId?: string }
    | { kind: "system"; source?: { workflowRunId: string; stepId?: string } };
  createdAt: string;

  // Two independent flags, not one audience enum.
  visibleToUser: boolean;
  visibleToAgent: boolean;

  body?: { text?: string; structured?: Record<string, unknown> };
  view?: { miniappId: string; props: Record<string, unknown> }; // interactive UI carrier
  status?: "live" | "completed" | "superseded"; // mutable system messages
  updatedAt?: string;
};
```

The flags give you three useful cases:

| `visibleToUser` | `visibleToAgent` | Use                                                                     |
| --------------- | ---------------- | ----------------------------------------------------------------------- |
| ✓               | ✓                | shared turn (e.g. "Here's the test plan I prepared")                    |
| ✓               | ✗                | UX-only (e.g. "Workflow paused, awaiting your input")                   |
| ✗               | ✓                | hidden agent context (workflow-injected instructions, structured input) |

The `view` field is how interactive UI lives **inside** a conversation message: it
references a [View](#views) (a miniapp) plus props. Actions on that View round-trip through
the workflow runtime as typed events; the renderer does not mutate React state directly.
This is the same View primitive used by recipe action launchers — the placement is just
`conversation.inlineCard` instead of `action`.

System messages are **mutable**. A workflow may update body/view/status until the message
reaches a terminal `completed` or `superseded` state. This subsumes the former
`activity.phase: presented → updated → completed` pattern; the upsert semantics live on the
message itself.

**LLM-context mapping** is an adapter concern, not part of the conversation model. When the
t3 adapter builds an agent turn, it filters by `visibleToAgent` and projects each message
into the provider's native role using whatever the provider supports (Anthropic system
blocks, OpenAI developer role, or `user` with a tag). The conversation model commits to
"three authors, two visibility flags"; the projection rule belongs to the adapter.

### Additive seam

The three-author model is added without forking upstream message types. The seam is a
single optional field on `Message`:

```ts
// packages/contracts/src/model.ts  (already allowlisted)
export type Message = {
  // ...existing upstream fields
  t3workExt?: T3workMessageExt;
};

// packages/contracts/src/t3work-message-ext.ts  (new, prefix-compliant)
export type T3workMessageExt = {
  author?: { kind: "system"; source?: { workflowRunId: string; stepId?: string } };
  visibleToUser?: boolean;
  visibleToAgent?: boolean;
  view?: { miniappId: string; props: Record<string, unknown> };
  status?: "live" | "completed" | "superseded";
  updatedAt?: string;
};
```

All rendering, persistence, and LLM-mapping logic lives in `t3work-`-prefixed files. The
upstream `Message` type gains one optional field. See [Epic 02 — Additive Extension
Pattern](./02-additive-architecture.md#additive-extension-pattern).

## Workflows

The workflow is the heart of the system. It is a **serializable, persisted, forward-only**
sequence of typed steps. The kickoff program was the first proof-of-concept slice of this
engine; it is being absorbed into the unified step model below rather than kept as a
separate mechanism.

```ts
type RecipeWorkflow = {
  version: 1;
  steps: RecipeWorkflowStep[];
};

type RecipeWorkflowStep =
  | { kind: "agent"; id: string; promptPath?: string; promptText?: string } // bootstrap live
  | { kind: "script"; id: string; module: string; input?: Record<string, unknown> } // live
  | { kind: "tool"; id: string; toolName: string; input?: Record<string, unknown> } // planned
  | { kind: "present-message"; id: string; message: SystemMessageSpec } // partial — see Step status
  | { kind: "collect-input"; id: string; request: InputRequest }; // partial — see Step status
```

`present-message` emits a system message (text and/or a View) into the conversation. It
absorbs the former `card` step: a "card" is just a `present-message` whose `message.view`
is a miniapp at `conversation.inlineCard`. Visibility flags on the message decide whether
the user, the agent, or both see it.

`collect-input` pauses the workflow until a typed event arrives. The input may come from a
View action on a prior `present-message`, structured form data, or plain text. This
absorbs both the former `wait-for-kickoff-input` step (text reply) and the former
`await-card-action` step (View action event). The common "present a card and wait for a
button" pattern is now `present-message` followed by `collect-input`.

The former `run-interactive-agent` step is just an `agent` step. There is one step union,
not a separate kickoff union and workflow union.

### Stateless, forward-only execution

The engine is stateless: it holds no in-memory coroutine state across turns. A run is a
**forward-only cursor** over the persisted step list. The interpreter resumes purely from
serialized state on disk — launch metadata, the step list, `nextStepIndex`, prior step
results, and any pending user submission.

The single suspension point is `collect-input`: it persists `nextStepIndex` and the awaited
request, then returns. Resume reads that state and continues forward from `nextStepIndex`.
Steps are never re-derived or rewound — agent/script/present-message side effects that
ran before a checkpoint are not replayed.

> Be precise about what "stateless" buys: it enables _resume_, not _replay_. Do not plan
> features that require re-running an earlier step; the architecture only moves forward
> from the last checkpoint. Stateful IO (filesystem, git, fetch, deriving artifacts,
> loading provider context) belongs in explicit `script` or `tool` steps that take serializable
> input and return serializable output, never in hidden engine state.

### Step status

- **Live:** the bootstrap `agent` step (the first kickoff turn); `script`; `present-message`
  in its "card" form (writes an activity payload today) and the matching `collect-input`
  in its "await-card-action" form.
- **Planned:** mid-workflow `agent` steps; `tool` steps (use a `script` step that calls
  tools for now); `present-message` for non-card messages (text-only and View-bearing system
  messages persisted as first-class messages via `t3workExt`); `collect-input` for text
  replies and structured form submissions (absorbing the former `wait-for-kickoff-input`).

Per-step failures are isolated and recorded as a failed step activity in the timeline;
they do not crash the run or the page.

## Tools

Tools are one shared capability surface, not a recipe-specific API. They began as
agent-scoped tools (`T3workToolBroker` binds a per-thread set of `callTool`/`readResource`
capabilities for an agent turn). The same surface is consumed by:

- agent turns (today),
- workflow `script` and `tool` steps,
- Views (via the miniapp tool bridge).

A script receives the broker binding as `api.tools`; it does not get a second, parallel
tool API. `allowedToolGroups` on the recipe scopes that surface for everything the recipe
runs. The full catalog, tool classes (read / view-state / draft-mutation / external-
convenience), and the safety matrix live in [Epic 21](./21-context-tool-catalog.md).

```ts
type RecipeScriptApi = {
  tools: {
    call<T = unknown>(name: string, input?: Record<string, unknown>): Promise<T>;
    readResource(uri: string): Promise<unknown>;
  };
  workspace: {
    rootPath: string;
    recipePath: string;
    runPath?: string;
    readText(relativePath: string): Promise<string>;
    writeText(relativePath: string, content: string): Promise<void>;
    exists(relativePath: string): Promise<boolean>;
  };
  log: {
    info(msg: string, f?: object): void;
    warn(msg: string, f?: object): void;
    error(msg: string, f?: object): void;
  };
  fetch: typeof fetch;
};
```

Binding modes:

- **Thread-bound:** post-launch steps run with the run's thread binding.
- **No-thread (pre-launch):** discovery, `visible`, and View pre-render get a read-only
  binding (read tools and `readResource` only). This is why `visible` must stay
  side-effect-free.

> **Implementation status.** The broker exists for agents. `script`-step and `tool`-step
> access to it is planned: today `api.tools.call` throws during visibility evaluation and
> `tool` steps are unsupported. Wiring scripts/steps to the broker, adding the no-thread
> binding, and enforcing `allowedToolGroups` is Phase 3 of the delivery plan. Until then
> `allowedToolGroups` is declarative metadata.

## Views

A View is a code-based interactive UI unit. The launcher you click in the action list and
the interactive card inside a conversation are the **same primitive** mounted at different
**placements** — there is no separate "action MDX is pre-launch only" rule and no separate
card protocol. Views are specified in [Epic 19: Workspace Miniapps](./19-workspace-miniapps.md);
this section only states how recipes use them.

A recipe may declare a launcher View (`view: "./action.view.tsx"`). The same View model
provides conversation cards during a run. Relevant placements:

- `action` — the clickable launcher in the dashboard or side panel (pre-launch).
- `conversation.inlineCard` — an interactive card inside the run's conversation.
- `conversation.sidecar` — a side panel beside the conversation.

In-conversation Views are not a separate "card protocol": they are carried by the `view`
field of a system message (see [Conversation Participants](#conversation-participants)).
A workflow's `present-message` step emits the system message; the host renders the
referenced View at the message's placement.

Views receive context as props and use shell-provided components and the tool bridge. They
never start a chat by themselves; the shell owns click and launch behavior. A View action
(button, form submit, approval) round-trips through the workflow runtime as a typed event
— it does not mutate React state directly and, under [stage 2](#security-two-stages), does
not call tools directly from the renderer.

If a recipe declares no View, the host renders a default launcher/card from the recipe
metadata.

> **Implementation status.** Launcher Views render today via the MDX runtime
> (`t3work-recipeActionView.tsx`, client-side `@mdx-js/mdx` evaluate). Host-rendered
> conversation cards (`checklist | form | approval | artifact-preview | status`) render
> today from workflow `card` steps. Converging both onto the single miniapp View model and
> the typed-event action path is Phase 5.

## The Run

When a recipe is launched the host materializes a **run** — a working directory on disk.
The "recipe instance" is not a separate concept: it _is_ the run's on-disk directory plus
its persisted workflow state. There is no `ActionRecipeInstance` type distinct from the
run.

```text
runs/
  <run-id>/
    recipe/
      recipe.ts          # the resolved recipe module (or a snapshot of it)
      context.json       # concrete full context for this launch
      context.schema.json
      context-map.md
      prompt.md          # rendered
      files/             # rendered payload files
      workflow-state.json # persisted forward-only cursor + step results
```

Materializing inputs to disk (rather than stuffing everything into the prompt) lets the
agent navigate large context with filesystem tools, gives a durable record of exactly what
was launched, and gives scripts a place to write outputs.

Launch sequence (thread-first, so the user sees state immediately):

1. Create or focus the conversation thread immediately.
2. Insert a structured **launch card** into the timeline (a host-owned View; see below).
3. Build the full context for the project and optional work item.
4. Render templated metadata and files; materialize the run directory; write `context.json`,
   `context.schema.json`, and `context-map.md`.
5. Begin executing the workflow. Show progress on the launch card.
6. Only send the first agent turn when the workflow reaches an `agent` step.

Agent bootstrap message:

```md
Follow the instantiated action recipe at:
<absolute-run-recipe-path>

Read recipe.ts (or recipe.json) first, then prompt.md.
Use context.json as source data.
Persist durable outputs as artifacts when appropriate.
```

> **Implementation status.** Run-directory materialization, `context.json`/schema/map, and
> the `init`/setup script are **not built yet** — today a launch hands the agent a rendered
> prompt string plus an optional workflow document; no instance directory is created. This
> is Phase 4. The optional setup script (formerly `init.ts`) is deferred until stage-2
> sandboxing exists, because it is the riskiest ambient-code path.

### Full context contract

The full context is richer than the render context and is written to disk for both humans
and agents to read.

```ts
type ActionRecipeContext = {
  project: T3WorkProjectSnapshot;
  workitem?: ResourceSnapshot;
  selectedResource?: ResourceSnapshot;
  linkedResources: ResourceSnapshot[];
  sourceProject?: ExternalProjectSnapshot;
  artifacts: RichArtifactSummary[];
  recentRuns: RecipeRunSummary[];
  profile: T3WorkProfile;
  enabledSkillPacks: string[];
  memory: ProjectMemorySnapshot;
  capabilities: RecipeCapabilitySummary;
};
```

Each run writes `context.json` (concrete data), `context.schema.json` (JSON Schema for all
fields), and `context-map.md` (a short human/agent field guide). The schema is generated
from the `ActionRecipeContext` type in `packages/project-context`, not hand-maintained, so
it cannot drift from the type.

## Conversation-Native Launch UX

A recipe click is a first-class workflow launch, not "fill the composer for me." Launch
switches the kickoff surface into normal conversation mode immediately.

The host-owned **launch card** is conversation-native state, distinct from author-defined
Views. Concretely it is the first system message of the run — a mutable system message
carrying a host-rendered launch View — inserted immediately on click, even while the
thread bootstrap or first context build is still pending. It shows at least:

- recipe id and version
- rendered title and short description
- source (`project-local` or bundled)
- selected surface and relevant work-item context
- current phase: `queued`, `creating-thread`, `bootstrapping-agent`, `running`,
  `waiting-for-input`, `completed`, `failed`
- optional reason/rank metadata when discovery provided it

The launch card updates in place (`status: live → completed`/`superseded`) as the workflow
advances. Subsequent workflow turns appear as additional system messages.

Launch is dynamic, decided by the workflow, not by a web-only special case: some recipes
auto-run the first agent turn immediately; others present a `collect-input` step and wait.
If the workflow pauses for input, the first user reply resumes the workflow path — the
reply is a normal `user` message in the conversation history, but workflow launch
semantics own the transition (it is not a plain `thread.turn.start`).

### Kickoff submission

The first user reply is a structured submission, not just a string:

```ts
type RecipeKickoffSubmission = {
  text?: string;
  attachments?: ReadonlyArray<RecipeLaunchAttachment>;
  structuredInput?: Record<string, unknown>;
};
```

A workflow paused on `collect-input` resumes through the recipe runtime with this
submission as workflow input. Any provider-specific translation from attachments to prompt
material happens after the workflow resumes, keeping kickoff and workflow one continuous
host-owned system.

> **Implementation status.** The launch card and a string-only kickoff message are live.
> The structured submission and `collect-input` are planned (Phase 2).

## Security: Two Stages

Project-hosted code (recipe modules, scripts, Views) is powerful. The model evolves in two
deliberate stages; both [Epic 16](./16-action-recipes.md) and
[Epic 19](./19-workspace-miniapps.md) share this framing.

**Stage 1 — Trusted (current).** Project recipes are trusted local code. Modules are loaded
with normal `import()`, scripts may use `node:` built-ins and `fetch` directly, and Views
are evaluated client-side. This is acceptable because, in the MVP, recipe code is authored
or reviewed by the project owner on their own machine.

**Stage 2 — Sandboxed (planned).** Project-hosted code runs with **no ambient
capabilities** — no direct filesystem, network, process, or React/DOM access. Everything
goes through host-injected APIs: the `T3workToolBroker` for tools, structured props for
data, and the typed-event path for View actions. Isolation is enforced by a worker/isolate
boundary (scripts) and a sandboxed iframe-equivalent (Views).

Design discipline to adopt **now**, while in stage 1, so stage 2 is "remove the escape
hatches" and not a rewrite:

- Route every capability through the injected `api.*` surface even though raw access still
  works. Do not let new recipes reach for `node:fs`/`fetch` when a tool exists.
- Make View actions emit typed events the workflow runtime handles, rather than calling
  tools from the renderer.
- Keep `allowedToolGroups` as the single enforcement point; it is inert in stage 1 but is
  exactly what stage 2 enforces.

Manifest/declared permissions should be shown before first enablement of any
project-hosted code.

## Agent-Created Recipes

Agents may offer to create a new project recipe after a workflow succeeds, or on direct
user request ("save this as a recipe"). Recipe authoring is itself a workflow — the
**`create-recipe` recipe** — built on the same primitives the agent is being asked to
extend. It is the canonical end-to-end example of the architecture working.

### The data contract the agent reads

When writing a recipe, the agent needs to know which surfaces exist, what fields live in
each surface's context, which queries are available, which tools the recipe may call, and
which Views can be referenced. The contract is the **TypeScript types**, exposed three
ways for whichever consumer prefers which form:

- **Generated `.d.ts` per surface** — the source of truth. `@t3work/plugin-sdk` exports
  `DashboardBacklogContext`, `WorkItemDetailContext`, etc. When the agent writes a
  `recipe.ts`, TypeScript checks every field access against the real context type. A wrong
  field is a compile error before runtime.
- **`context.schema.json`** — JSON Schema mirror of the same types, generated from the TS
  definitions in `packages/project-context`. For tools and agents that prefer schema over
  TS.
- **`context-map.md`** — short human/agent field guide. Which fields exist on the chosen
  surface, which are eager vs. lazy, which expose query methods, with one-line
  descriptions and an example call.

The same generated pipeline covers **Tools** (`@t3work/plugin-sdk` exports a typed
registry, autocomplete shows what's available) and **Views** (typed miniapp registry — a
recipe's `view:` reference is type-checked against the surface's context).

### The `create-recipe` workflow

A small, declarative workflow built from the unified step union — and itself a useful
proof that the architecture composes end-to-end:

```ts
// recipes/create-recipe/recipe.ts (bundled)
export default defineRecipe({
  id: "create-recipe",
  surfaces: ["thread.context"],
  // ...
  workflow: defineWorkflow({
    steps: [
      {
        kind: "collect-input",
        id: "ask-surface",
        request: {
          /* "which surface should this recipe appear on?" */
        },
      },
      {
        kind: "script",
        id: "gather-authoring-context",
        module: "./gather-authoring-context.ts",
        // assembles: surface's context.d.ts, allowed tool catalog,
        //   relevant existing recipes as exemplars, context-map.md
      },
      {
        kind: "agent",
        id: "draft-recipe",
        // prompt: write a recipe.ts using the assembled authoring context
      },
      {
        kind: "script",
        id: "validate",
        module: "./validate.ts",
        // type-checks + runs the additive guard against the draft
      },
      {
        kind: "present-message",
        id: "preview",
        message: {
          /* shows the draft + diff; carries a "Save" view */
        },
      },
      {
        kind: "collect-input",
        id: "confirm-save",
        request: {
          /* awaits the Save view action */
        },
      },
      {
        kind: "script",
        id: "save",
        module: "./save.ts",
        // writes recipes/<id>/recipe.ts and any helpers
      },
    ],
  }),
  allowedToolGroups: ["recipe.author", "artifact.rw"],
});
```

If this workflow runs end-to-end, the architecture has paid for itself: it exercises the
unified step union, system messages with embedded Views, the shared tool surface, the
materialized run directory, and the additive-guard discipline — all on the same primitives
described in this epic.

### Default behavior

- **Offer first**, never silently create. The agent triggers the `create-recipe` workflow
  with an explicit user confirmation; it does not write recipe files in the background.
- Save under the current project `recipes/` directory as a `recipe.ts` plugin module.
- Include a redacted fixture from the successful context for tests and future authoring.
- Reference the `context.schema.json` fields the module uses (the generated TS types are
  the binding contract).
- Prefer small reusable files over one large prompt.

Example offer:

```text
This workflow is repeatable. Create a project action recipe named "QA smoke plan"?
```

A malformed agent-written module is isolated by discovery (it is dropped, with diagnostics)
rather than breaking the project. Personal scope and company collections come after the
project recipe format proves stable.

## Managed Workspace Layout

Project recipes live next to project data:

```text
<managed-project>/
  project.json
  recipes/
    qa-test-plan/        # a recipe plugin module
  runs/
    <run-id>/
      recipe/            # the materialized run (the "instance")
  documents/
  cache/
  memory/
```

Bundled recipes from skill packs may be referenced or copied into project scope when a
project is created. Project-local recipes are the editable source of truth for the MVP.

## Implementation Status Summary

| Area                                                                                               | Status                                             |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Project-local discovery + bundled matching                                                         | Built                                              |
| Visibility (predicate + script, timeout, isolation)                                                | Built (via `recipe.json` + expression engine)      |
| TS-module authoring (`recipe.ts`), retire expression engine                                        | Planned (Phase 1)                                  |
| Unified workflow step union; kickoff absorbed                                                      | Planned (Phase 2)                                  |
| Workflow runtime: bootstrap agent, card, await-card-action, script                                 | Built                                              |
| Workflow runtime: mid-flow agent, tool, present-message, collect-input                             | Planned (Phase 2)                                  |
| Three-author conversation model + `t3workExt` seam (system messages, view-in-message)              | Planned (Phase 2)                                  |
| Shared tool surface for scripts/steps via broker; enforce `allowedToolGroups`                      | Planned (Phase 3)                                  |
| Run-directory materialization, `context.json`/schema/map                                           | Planned (Phase 4)                                  |
| Setup script (formerly `init.ts`)                                                                  | Deferred until stage-2 sandbox                     |
| Views unified on miniapp model; typed-event action path                                            | Planned (Phase 5)                                  |
| `Queryable<T>` contract (Array-backed at MVP)                                                      | Planned (Phase 2 — needed by unified steps)        |
| `Queryable<T>` runtime: SQL-backed + signals (Signia / equivalent); projection-driven invalidation | Planned (Phase 6 — scale tier)                     |
| Agent-discovery types pipeline: generated `.d.ts` + `context.schema.json` + `context-map.md`       | Planned (Phase 4 — pairs with run materialization) |
| `create-recipe` recipe (canonical end-to-end workflow proof)                                       | Planned (after Phase 2)                            |
| Stage-2 sandboxing                                                                                 | Planned, parallel track                            |

## Implementation Notes

- `packages/project-recipes` owns recipe definitions, the workflow engine, discovery, and
  visibility evaluation.
- `packages/project-context` owns context schemas, the `Queryable<T>` contract, and the
  generated agent-discovery artifacts (`.d.ts` per surface, `context.schema.json`,
  `context-map.md`). All three are generated from the canonical TS types — never
  hand-maintained.
- `@t3work/plugin-sdk` (to be introduced) owns `defineRecipe`/`defineWorkflow` and the
  plugin-module contract; `@t3work/miniapp-sdk` owns Views.
- `T3workToolBroker` (`apps/server`) is the single tool surface for agents, scripts, and
  Views. Mutations through it emit events on the existing orchestration bus.
- **The Queryable runtime is backed by the existing local SQLite persistence layer**
  ([apps/server/src/persistence/Layers/Sqlite.ts](apps/server/src/persistence/Layers/Sqlite.ts)
  via `effect/sql` + migrations under `persistence/Migrations/`). Provider sync writes
  into namespaced tables (the t3work-Atlassian backlog cache at
  [t3work-atlassian-backlog-cacheReadWrite.ts](apps/server/src/t3work-atlassian-backlog-cacheReadWrite.ts)
  is the existing template). Recipe/View queries run against this store, not against
  HTTP-keyed caches.
- Reactivity reuses the existing orchestration-events / projection pipeline for
  invalidation. The client-side reactive layer (likely [Signia](https://github.com/tldraw/signia)
  or equivalent — Solid-store standalone and MobX are alternatives) subscribes to projection
  changes and drives recipe/View re-evaluation through the Proxy-traced dependency layer.
  TanStack Query and similar URL-keyed caches are explicitly **not** the model.
- `apps/web/src/t3work` renders recipe actions and launch cards; it must not evaluate
  provider-specific context directly.
- Thread bootstrap and the special recipe launch message live in the t3 adapter / server
  workflow runtime ([t3work-recipeWorkflowRuntime.ts](apps/server/src/t3work-recipeWorkflowRuntime.ts)).
