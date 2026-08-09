# Epic 40: Code and Work Sidebar Surfaces in T3 Team

## Decision

T3 Team is the permanent product shell. It is not a mode that users can turn off.

Upstream's Code/Work toggle is integrated inside that shell and changes the sidebar
presentation only:

- **Code** keeps the upstream-style classic sidebar.
- **Work** uses the upstream-style Inbox sidebar.

The toggle does not create a second product, thread, provider runtime, persistence model,
authentication boundary, or work/code capability set. The selected project, environment,
thread, draft, and detail-sidecar preference survive the switch. There are no
"Open in Code" or "Open in Team" actions: the user changes the sidebar lens while
remaining in T3 Team.

## Product graph

The shared product graph remains:

```text
Company / project
  ├─ work item (label/context, not a hierarchy node)
  │   └─ parent and child threads
  ├─ workflow runs / packs
  └─ change sets / reviews
```

Work items provide context and attribution. Only parent/child threads create sidebar
hierarchy. A work item is not a container row above its threads by default.

## Code / classic sidebar

Code follows upstream's classic behavior and remains deliberately lean:

- preserve upstream thread lifecycle, selection, waiting, approval, snooze, settled,
  PR-indicator, and wake behavior;
- retain parent/child thread hierarchy;
- show T3 Team project/work-item attribution only where it is not already obvious from
  the hierarchy;
- do not duplicate work-item metadata as additional rows merely to advertise Team;
- keep work-item, workflow, and pack details in the selected thread or sidecar unless an
  upstream surface already exposes them.

The Code sidebar is still inside the T3 Team shell. It is not a separate product view.

## Work / Inbox sidebar

Work integrates T3 Team context into upstream Inbox behavior rather than replacing it
with a project-management tree.

### Thread rows

- Ordinary threads without a T3 Team work item remain ordinary upstream Inbox threads.
- Threads with a work item always show compact work-item attribution in Inbox.
- Child threads remain the only hierarchy. Inbox may show a child as a standalone active
  row even when its parent is settled.
- The current selected thread remains selected when switching between Code and Work.
- Clicking a thread opens that thread and respects its saved detail-sidecar view setting.

### Work-item rows

Work-item rows are optional Inbox entries, not hierarchy parents. They appear when the
work item is directly assigned to the user or explicitly pinned. They should reuse the
existing T3 Team navbar-item visual language while remaining visually distinct from
thread rows and fitting the upstream Inbox look.

- Clicking a work-item row opens work-item details.
- Work-item rows participate in the same merged stream as thread activity.
- Position should be based on the latest relevant activity, including descendant thread
  activity, subject to the upstream Inbox ordering rules.
- If a work item and related thread are both visible, experiment with visual grouping and
  adjacency without turning the work item into a hierarchy node.

### PR indicators

PRs are not first-class Inbox rows yet. Native PR detail is deferred to a dedicated
GitHub integration stream with full GitHub feature parity as its target.

For now:

- reuse upstream's thread-to-PR association and external-click behavior;
- show a small official GitHub-style PR state icon on a thread when it has an associated
  PR;
- when descendant threads have PRs, a work-item row may show an aggregate count across
  all descendants;
- do not invent a native PR detail view in this sidebar work.

### Scheduled work

Autonomous workflow waits use a separate **Scheduled** section. This is not upstream's
user-controlled Snoozed behavior.

- Scheduled is visible in both Code and Work.
- It is lower priority than active/actionable work but remains glanceable.
- Rows use compact relative time where possible, such as `in 3h`.
- If the workflow supplies a useful reason, show it, such as `Waiting for deploy window ·
in 3h`; otherwise do not invent a reason.
- Earliest wake time is the provisional ordering.
- Wake, promotion, unread, and lifecycle transitions follow upstream behavior rather than
  introducing a competing Team-specific lifecycle model.
- Shelf expansion and fallback wording remain visual implementation details to evaluate
  with a concrete prototype.

Approval-required and user-input states remain upstream states and should not be
reimplemented as generic workflow badges. Abstract workflow existence has no Inbox value
by itself; expose only a concrete user-relevant consequence such as a wake time, approval,
input request, failure, or change-set state.

## Cross-surface invariants

1. One thread remains one thread across Code and Work.
2. Mode switching never duplicates, relocates, or forks a thread.
3. Project, environment, work-item context, selection, draft, and sidecar preference
   survive switching.
4. Team remains the shell and owns work-item, workflow, pack, review, and change-set
   semantics.
5. Code and Work are presentation lenses, not authorization or execution modes.
6. Workflow sleeping is distinct from user snooze; settled is distinct from deleted.
7. Upstream lifecycle and attention behavior remains authoritative unless T3 Team adds a
   concrete, documented presentation rule.

## Implementation seams

Adapt the existing T3 Team seams instead of creating a parallel product shell:

- `apps/web/src/t3team/components/t3team-ProjectSidebar.tsx`
- `apps/web/src/t3team/components/t3team-projectSidebarThreadTree.ts`
- `apps/web/src/t3team/t3team-routeState.ts`
- `apps/web/src/t3team/t3team-mergedThreads.ts`
- `apps/server/src/t3team-thread-placement-routes.ts`
- `packages/contracts/src/orchestration.ts`
- workflow, pack, sidecar, and change-set surfaces under `apps/web/src/t3team/`

Keep the adapter above shared thread/runtime state:

```text
T3 Team shell
  ├─ Code / classic sidebar adapter
  ├─ Work / Inbox sidebar adapter
  └─ shared thread, project, work-item, workflow, and source-control state
```

Reuse upstream pure lifecycle, sorting, waiting, selection, and PR-state concepts through
small adapters. Do not blindly import upstream Sidebar V2 as the Team information
architecture.

## Delivery plan

### Phase 0: establish the shared sidebar contract

- Map upstream Code/Work state into T3 Team's permanent shell.
- Preserve selection, drafts, deep links, and sidecar preference.
- Add contract tests for cross-surface identity and route state.

### Phase 1: integrate Work / Inbox context

- Add compact work-item attribution to Inbox thread rows.
- Add assigned/pinned work-item rows with distinct-but-native rendering.
- Preserve upstream ordering and lifecycle behavior before experimenting with grouping.

### Phase 2: add Team-specific observability

- Adapt child-thread and workflow-run state to the Inbox without replacing its flat
  activity model.
- Add Scheduled rows for concrete autonomous wake times.
- Keep approval and user-input states on upstream status paths.

### Phase 3: source-control indicators

- Reuse upstream PR association and external links.
- Add GitHub-state icons and descendant PR counts on work items.
- Keep full PR detail and review parity in a separate GitHub integration stream.

## Verification requirements

- Route tests prove Code ↔ Work preserves thread identity, selection, draft, environment,
  work-item context, and sidecar preference.
- Sidebar tests prove classic hierarchy, Inbox attribution, child-thread standalone
  visibility, assigned/pinned work-item rows, and PR count propagation.
- State tests distinguish approval, user input, workflow sleeping, Scheduled, Snoozed,
  settled, and wake transitions.
- Browser checks cover switching surfaces, clicking work items, clicking threads, and
  preserving the selected thread.
- Focused upstream merge tests cover lifecycle, selection, PR indicators, and source
  control.
- Scheduled visual tests cover compact relative time, optional reason text, and wake
  promotion.

## Explicitly deferred

- Native PR detail and full GitHub review parity.
- A separate project-management tree inside Work/Inbox.
- Generic workflow badges without a user-relevant consequence.
- Final visual treatment of work-item/thread grouping and Scheduled shelf expansion.

## Product decisions still open only for implementation exploration

- Exact merged-stream grouping and adjacency treatment when a work item and its thread are
  both present.
- Scheduled fallback wording and collapsed/expanded shelf presentation.
- Whether an aggregate PR count is displayed as an icon, count badge, or both.
