# Epic 40: Code And Team Modes

## Decision

T3 Team supports two user-facing modes over one shared thread, project, workflow, and
runtime model:

- **Code mode** is the focused coding surface: projects, threads, files, worktrees, Git,
  terminals, diffs, and pull requests.
- **Team mode** is the coordination surface: projects, work items, parent and child
  threads, workflows, packs, change sets, and review.

The mode is a presentation and navigation context. It is not a second provider runtime,
thread database, persistence model, or authentication boundary. A thread created in one
mode remains the same thread when opened in the other mode.

Use **Team** as the visible T3 Team label. Do not expose the conflicting product name
"T3 Work". If an upstream contract eventually calls the second surface `work`, adapt it
at the mode registry boundary rather than leaking that identifier through T3 Team UI.

## Why two modes

Upstream T3 Code is evolving a native coding surface around Sidebar V2 and thread
lifecycle states. Relevant upstream work includes:

- [Agents and workflow observability](https://github.com/pingdotgg/t3code/pull/4220)
- [Waiting status for background tasks](https://github.com/pingdotgg/t3code/pull/4415)
- [Review unsettled threads](https://github.com/pingdotgg/t3code/pull/4417)
- [Server-driven PR monitoring](https://github.com/pingdotgg/t3code/pull/4428)
- [Folders, worktree labels, and Git sync](https://github.com/pingdotgg/t3code/pull/4207)
- [Thread forking](https://github.com/pingdotgg/t3code/pull/4390)
- [Thread references](https://github.com/pingdotgg/t3code/pull/4010)

These primitives are valuable in both surfaces, but upstream's flat coding-thread inbox
does not replace T3 Team's project-to-work-item hierarchy. We adopt the lifecycle and
observability primitives, while keeping the Team information architecture.

The latest inspected upstream main was
[`202e5609`](https://github.com/pingdotgg/t3code/commit/202e5609ffb294bc0aa86c08ce1d3751de567226).
The latest inspected nightly was
[`v0.0.29-nightly.20260724.890`](https://github.com/pingdotgg/t3code/releases/tag/v0.0.29-nightly.20260724.890).
Maria's visible [snooze UI PR #4418](https://github.com/pingdotgg/t3code/pull/4418)
improves parked-thread shelves and the composer wake banner. The exact upstream
Code/Work toggle discussed during planning was not publicly verifiable in the inspected
PR set; treat its final contract as incoming evidence, not as an assumption here.

## Shared product graph

```text
Company / project
  ├─ work item
  │   ├─ parent thread
  │   │   ├─ child research thread
  │   │   └─ child implementation thread
  │   └─ change set / review
  └─ project-level thread
```

The same graph is presented differently by each mode:

| Shared entity | Code mode | Team mode |
|---|---|---|
| Project | Project/thread inbox | Project dashboard and work areas |
| Work item | Optional context attachment | First-class backlog/My Work entity |
| Thread | Chat, files, terminal, Git, PR | Parent/child coordination and handoff |
| Workflow run | Execution details and logs | Pack/recipe outcome attached to work |
| Change set | Diff and source-control review | Work-item approval and delivery state |
| Agent child | Activity or agent panel | Nested child thread under the parent/work item |

## Global shell and mode switch

The global shell owns the mode switch, project/environment selection, command palette,
notifications, and active-thread identity. The switch should be compact and persistent:

```text
[ T3 Team ]    [ Code ] [ Team ]
```

Rules:

1. Persist the preferred mode per workspace or project, not globally for every project.
2. Include the mode in deep links when a destination is mode-specific.
3. Preserve project, work-item, thread, and environment context across a switch.
4. Never create or duplicate a thread merely because the user changed modes.
5. Provide explicit actions: **Open in Code**, **Open in Team**, and **Attach to work item**.
6. On mobile, keep the same mode model but use a top-level segmented control or a
   navigation-sheet entry; do not create a third mobile-only information architecture.

Suggested surface type:

```ts
type ProductSurface = "code" | "team";
```

The value belongs in route/UI state. Provider selection, runtime mode, permissions, and
thread identity remain shared.

## Code mode

Code mode should feel native to upstream T3 Code:

- project and thread sidebar
- active, waiting, settled, snoozed, and needs-attention states
- working duration and in-flight indicators
- files, terminal, worktree, branch, diff, and pull-request panels
- thread fork and thread-reference actions
- environment-aware new-thread creation

Code mode is where an individual implementation thread gets executed. It should not
attempt to render the full backlog, work-item hierarchy, or pack authoring surface.

## Team mode

Team mode keeps the existing T3 Team hierarchy:

```text
Project
  ├─ Overview / Backlog / My Work
  ├─ Work item
  │   ├─ context-bound parent thread
  │   ├─ child agent threads
  │   └─ change set / review
  └─ project-level planning threads
```

Team mode is where a lead or individual contributor answers: What matters, who is doing
it, what is blocked, what changed, and what should happen next?

Its sidebar remains hierarchical. Upstream's flat Sidebar V2 can inspire a filter lens,
but should not replace the Team tree.

## Core user flows

### Start work

1. User opens a project or work item in Team mode.
2. User chooses an action such as Investigate, Plan, Implement, or Review.
3. T3 Team creates one context-bound thread with the work-item context.
4. The thread appears under the work item and can be opened in Code mode.

### Delegate nested work

1. Parent thread starts a child through the T3 Team child-thread tool.
2. Child appears beneath the parent and remains linked to the work item.
3. Child reports progress, result, or a request for input.
4. Parent shows a durable summary card; Team mode rolls the state up to the work item.
5. Code mode may show the same child in its agent/activity panel without flattening the
   Team hierarchy.

### Wait for background work

Use one honest vocabulary:

- **Working**: the current turn is active.
- **Waiting for agent**: a child or delegated task is still active.
- **Waiting for CI**: a monitor is active.
- **Waiting for you**: approval or input is required.
- **Sleeping**: a workflow is clock-parked.
- **Snoozed**: the user hid a thread until a time.
- **Settled**: the user considers the thread parked/done for now.

Waiting must remain visible in both modes. A thread with a live monitor or child must not
briefly look Done.

### Review and delivery

1. Code mode shows the files, diff, branch, checks, and PR monitor.
2. Team mode shows the change set attached to the work item.
3. User approves, edits, rejects, or delegates the change set.
4. The parent thread receives the result and the work item records the decision.

## State axes

Keep these axes independent:

1. **Placement**: project, work item, parent thread, child thread.
2. **Conversation**: working, complete, failed, awaiting input.
3. **Execution**: queued, running, sleeping, paused, cancelled.
4. **Attention**: unread, approval required, snoozed, settled, woke.
5. **Delivery**: files changed, PR checks, review state, change-set state.

In particular, workflow sleeping must not be represented as user snoozing, and settled
must not mean deleted. Settled and snoozed threads remain deep-linkable in both modes.

## Architecture seams

The implementation should extend these existing T3 Team seams rather than create a
parallel product shell:

- `apps/web/src/t3team/components/t3team-ProjectSidebar.tsx`
- `apps/web/src/t3team/components/t3team-projectSidebarThreadTree.ts`
- `apps/web/src/t3team/t3team-routeState.ts`
- `apps/web/src/t3team/t3team-mergedThreads.ts`
- `apps/server/src/t3team-thread-placement-routes.ts`
- `packages/contracts/src/orchestration.ts`
- T3 Team workflow, pack, sidecar, and change-set surfaces under `apps/web/src/t3team/`

The mode adapter should sit above these surfaces:

```text
Shared shell
  ├─ ProductSurfaceContext
  ├─ shared thread/runtime state
  ├─ shared command palette and notifications
  ├─ CodeSurface
  └─ TeamSurface
```

Do not import the entire upstream `SidebarV2` into Team mode. Reuse its pure lifecycle,
sorting, waiting, and observability concepts through small namespaced adapters.

## Delivery plan

### Phase 0: shared mode contract

- Add the mode registry and route/UI state.
- Define cross-mode navigation payloads.
- Acceptance: switching modes preserves project, environment, thread, and draft context.

### Phase 1: native Code mode

- Integrate the upstream coding sidebar and source-control surfaces.
- Keep Team mode behind its own surface boundary.
- Acceptance: Code mode can create, open, fork, monitor, and review a thread without
  mutating Team placement.

### Phase 2: Team mode continuity

- Add Open in Code, Open in Team, and Attach to work item.
- Show Team parent/work-item context in Code mode.
- Show Code branch/diff/PR state in Team mode.
- Acceptance: one thread remains addressable and correctly placed from both modes.

### Phase 3: nested observability

- Adapt upstream Agents panel data to parent/child T3 Team threads and workflow runs.
- Add waiting and wake summaries to parent threads and work items.
- Acceptance: background work, child completion, failure, and input requests are visible
  without opening every child.

### Phase 4: review and triage

- Attach PR monitors and change sets to work items.
- Add a project triage lens: Needs attention, Active, Waiting, Snoozed, Settled.
- Acceptance: the Team tree remains the default; the lens is shareable and agrees with
  the sidebar status resolver.

## Verification requirements

- Route tests for mode persistence, deep links, and cross-mode navigation.
- Mapper tests proving thread identity and Team placement survive a mode switch.
- State tests proving workflow sleeping, user snooze, settled, and waiting are distinct.
- Parent/child tests for roll-up, wake-up, failure, and requested input.
- Browser checks for Code → Team and Team → Code flows.
- Mobile checks for the mode switch and nested-thread navigation.
- Focused upstream-merge tests for orchestration contracts, provider runtime ingestion,
  persistence, and PR monitoring.

## Rejected alternatives

1. **Use Sidebar V2 as the Team sidebar.** This loses the project/work-item/thread
   hierarchy and creates a second product IA.
2. **Maintain separate Code and Team thread records.** This duplicates history and makes
   handoff, notifications, and review unreliable.
3. **Treat Team as a provider or runtime mode.** Product surface and execution policy are
   different concerns.
4. **Conflate workflow sleeping with user snooze.** One is execution state; the other is
   attention/visibility state.
5. **Make the flat triage lens the default.** Team users need hierarchy first; flat views
   are valuable for focused review and morning triage.

## Open decisions

- Whether Team-mode settled/snoozed state is shared across teammates or user-local.
- Whether the final upstream label is `Work`, `Team`, or another name; T3 Team should
  avoid exposing the conflicting “T3 Work” brand.
- Whether mode preference belongs to a project, workspace, or environment.
- Which Code-mode panels are available on mobile and which remain deep links.

