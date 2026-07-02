# 34 — Daily Standup (standup surface, dependency-aware ordering, standup workflows)

Status: **draft for review** · idea floated 2026-06-30
Owner: PJ
Related: 21-context-tool-catalog, 22-github-pull-request-workspace, 27-scheduled-workflows,
29-planning-space, 30-capacity-and-teams, 31-composable-project-views

## 1. Summary

A **Standup** surface, likely supplied by a work-management or Atlassian pack: one page
that walks a team through "yesterday / today /
blockers" per person for the active sprint — Jira's standup view as the familiar
baseline — plus the thing Jira can't do: **custom ordering, including dependency-aware
order derived from a combined Jira + GitHub link graph.** The team is walked in an order
that surfaces blockers first and puts the people who unblock others ahead of the people
who depend on them, instead of going alphabetically or by board column.

Around the view sit **standup workflows**: an async pre-standup digest that pre-fills
each person's "since last standup" from real activity, a live facilitation run that
walks the roster on the chosen order and captures action items, and a blocker follow-up
that turns flagged blockers into tracked, nudged work.

Two principles:

1. **The ordering is a first-class, pluggable strategy — not a hardcoded sort.** Order
   strategies (dependency, capacity, risk, board column, alphabetical, manual) are
   named, composable, and agent-authorable, the same way views are composable in
   [Epic 31](./31-composable-project-views.md).
2. **Reuse the graph we already have.** GitHub activity already extracts work-item keys
   from PR titles/branches/repos and groups activity by work item (Epic 22). Jira issue
   links, parent/subtask edges, and sprint membership are already in the current Atlassian
   backlog cache proof.
   The dependency order is computed over that joined graph server-side — no new raw
   provider access.

## 2. Scope

In scope (v1):

- New **`standup` project view** (peer to pack-provided `backlog`, `my-work`, and
  `capacity` views), scoped to a board's active sprint. Under Epic 31 it is a registered
  `project.navView` composed from safe blocks.
- **Per-person panel**: avatar/name/capacity chip, three columns —
  - _Since last standup_: items moved status / closed, PRs opened·merged·reviewed,
    comments authored, in the window since the last standup run (default: previous
    workday, configurable).
  - _Today_: in-progress items + the next-up item by ordering.
  - _Blockers_: Jira `is blocked by` links, items flagged/blocked status, stale PRs
    (open & waiting on review N days), and dependency edges where this person is
    waiting on another team member.
- **Ordering bar**: pick the active order strategy; reorder is animated; manual drag
  overrides and persists per project. Default strategy: `dependency`.
- **Dependency lane** (the differentiator): an inline strip per person showing who they
  unblock (downstream) and who they wait on (upstream), with click-through to the
  blocking item/PR.
- Roster from [Epic 30](./30-capacity-and-teams.md): default team ∪ assignees seen in
  the active sprint; capacity chip reuses `CapacityRing`.
- Workflows (§6): pre-standup digest (scheduled), live facilitation run, blocker
  follow-up.
- Agent integration (§7): context contract, read/view/mutation tools, recipe seeds.

Out of scope (v1): multi-team / scrum-of-scrums roll-ups; voice/transcription capture;
posting summaries to Slack/Teams (later Surface); cross-project dependency graphs
(single board/sprint only); real-time presence of who's currently speaking.

### 2.1 Placement

Starts as a pack-provided project nav view beside `Backlog · My Work · Capacity`. During
the current implementation it may still appear through the dashboard mode switch. Entry
points:

1. Dashboard mode switch.
2. Scheduled pre-standup digest (§6.1) deep-links into the surface with the day's window
   pre-selected.
3. Agent tool `t3work.project.open_dashboard_mode` gains the `standup` target.

## 3. The link graph & dependency ordering

The novel capability. One server-side build, consumed by the ordering strategies and the
dependency lane.

### 3.1 Edge sources (all already available, joined here)

```
Jira issue links     blocks / is blocked by / relates to        (connector cache)
Parent / subtask     story → subtasks, epic → stories           (connector cache)
GitHub PR ↔ issue    PR closes/links work-item key              (Epic 22 extraction)
GitHub PR reviews    author waits on requested reviewer         (Epic 22 PR state)
Sprint membership    restrict the graph to the active sprint    (connector cache)
```

Each edge is normalized to `{ from: node, to: node, kind, source, evidence }` where
`node` is a work item or a person, `kind ∈ { blocks, parentOf, prCloses, awaitsReview,
… }`, and `evidence` links back to the Jira link / PR (so the lane is explainable, never
a mystery number — same rule as Capacity's "32h × 80%").

### 3.2 From item graph to person order

```
1. Build the item dependency DAG for the active sprint (blocks + prCloses edges).
2. Project onto people: person A → person B when an item owned by A blocks an item
   owned by B (or A's review is what B's PR waits on).
3. Topologically sort people; break cycles by edge weight (open blockers > soft links)
   and report them as "circular dependency" warnings rather than failing.
4. Tie-break within a topological layer by the secondary strategy (default: capacity
   fullness, fullest first — they have the least slack).
```

Result: people who unblock others are walked first; pure consumers last; anyone with an
**open blocker on someone not yet spoken** is flagged so the facilitator can resequence.

### 3.3 Order strategies (pluggable)

```ts
type StandupOrder = {
  id: string; // "dependency" | "capacity" | "risk" | "board" | "alpha" | "manual"
  label: string;
  order(roster: Person[], graph: LinkGraph, ctx: SprintCtx): Person[];
  tieBreak?: string; // id of a secondary strategy
};
```

Built-in: `dependency` (default), `capacity` (fullest first, from Epic 30), `risk`
(most at-risk items first), `board` (board column), `alpha`, `manual` (saved drag
order). Agents author new strategies as small project-local modules and the user reviews
them before enablement (Epic 31 authoring rules). A strategy is pure
`(roster, graph) → roster` — it cannot fetch, only reorder.

## 4. Surface shape

- **Header**: board/sprint (active sprint default) · order strategy picker · window
  picker ("since: yesterday / last standup / custom") · "start standup" (launches the
  facilitation run, §6.2).
- **Roster column** (left, ordered): compact person rows; current speaker highlighted;
  blocker badge count; capacity ring. Drag to override → switches strategy to `manual`.
- **Person panel** (main): the three columns from §2; the dependency lane pinned under
  the name. "Add to chat" and per-item recipe launchers reuse existing affordances.
- **Empty / degraded**: no GitHub connection → graph uses Jira links only, with a "PR
  signal off" badge; no Tempo → capacity tie-break falls back to alpha. The surface is
  useful with Jira alone.

## 5. Data model

No new heavy store — the graph is **derived, cached briefly, not authored**. Only
standup-local preferences persist (backend SQLite, migration `t3work-036_Standup`):

```sql
t3work_standup_prefs   (project_id, board_key, order_strategy, manual_order JSON NULL,
                        window_kind, updated_at)
t3work_standup_runs    (id, project_id, board_key, sprint_id, started_at, ended_at,
                        order_strategy, notes JSON NULL)   -- one row per facilitated run
t3work_standup_notes   (run_id, account_id, talking_points TEXT NULL,
                        action_items JSON NULL)            -- captured during the run
```

The link graph itself is computed by `/standup/graph` from the backlog cache + GitHub
activity and cached per (board, sprint) with the doc-18 freshness pattern; it is never
the source of truth.

## 6. Standup workflows

### 6.1 Pre-standup digest (scheduled)

A [scheduled workflow](./27-scheduled-workflows.md) that runs each workday morning
before standup:

- For each roster member, summarize _since last standup_ activity into a short,
  human-readable line (closed PROJ-12, merged PR #44, blocked on PROJ-19).
- Compute the dependency order and flag new blockers / new circular dependencies vs the
  previous run.
- Persist as a `standup_run` draft + a durable artifact; deep-link notification (later:
  post to Slack — a Surface, out of v1).
- The live run opens pre-filled instead of blank.

### 6.2 Live facilitation run

Launched from "start standup":

- Walks the roster in the active order with a per-person soft timer.
- Each person's panel is the focus; facilitator captures talking points + action items
  (stored in `t3work_standup_notes`).
- Action items can be drafted into reviewable mutations (Jira comment, create blocker
  link, assign follow-up) — never written without review (constitution + Epic 22 rule).
- On finish: writes the `run`, offers a summary artifact, and seeds the blocker
  follow-up.

### 6.3 Blocker follow-up

For each blocker flagged in the run: draft a nudge (comment on the blocking item /
ping the blocking PR's reviewer), or create/track a blocker link. All reviewable. Pairs
with the dependency lane so "who is blocking whom" turns into action, not just display.

## 7. Agent integration (per Epic 21 tool classes)

Context contract `dashboard.standup.summary`: `{ boardKey, sprintId, window, order,
perPerson: [{ accountId, name, since[], today[], blockers[], upstream[], downstream[] }],
cycles[] }` — the agent reasons over the same ordered, resolved data the user sees.

```text
# read (safe)
t3work.standup.read_board            # ordered roster + per-person panels + graph
t3work.standup.read_person
t3work.standup.read_graph            # the dependency edges with evidence

# view-state (safe)
t3work.standup.open_view             # open standup mode, optional sprint/window
t3work.standup.set_order             # switch strategy or apply a manual order

# local + draft mutations (reviewed)
t3work.standup.start_run / end_run
t3work.standup.capture_note          # {accountId, talkingPoints?, actionItems?}
t3work.standup.draft_followup        # → reviewable Jira/GitHub mutation
```

Recipe seeds: "run our standup" (facilitate on dependency order, capture, summarize),
"what changed since yesterday?" (pre-standup digest on demand), "untangle our blockers"
(walk the cycles + downstream chains and propose resequencing / follow-ups), "who's
overloaded this sprint?" (cross with Epic 30 capacity).

## 8. Delivery plan

1. **P1 — Graph + order**: `/standup/graph` (join backlog cache + GitHub activity),
   the strategy interface + `dependency`/`alpha` built-ins, topological sort with cycle
   reporting, unit tests (Jira-only, +GitHub, cyclic, empty sprint). Exit: curl an
   ordered roster with evidence.
2. **P2 — Surface**: standup dashboard mode, roster column, person panel (three
   columns), dependency lane, order picker + manual drag, prefs persistence. Exit:
   run a real PW sprint standup on dependency order.
3. **P3 — Strategies + capacity tie-break**: `capacity`/`risk`/`board` strategies,
   `CapacityRing` reuse, degraded-mode badges.
4. **P4 — Workflows**: facilitation run (timer, note capture, runs/notes tables),
   blocker follow-up draft mutations, summary artifact.
5. **P5 — Scheduled digest + agent**: pre-standup scheduled workflow, context contract,
   tool set, recipe seeds, doc-21 safety-matrix entries.
6. **P6 — Composable view**: register as a `project.navView` and express the surface
   through `@t3work/blocks` (new blocks: `StandupRoster`, `StandupPersonPanel`,
   `DependencyLane`) per Epic 31.

## 9. Open questions

- "Since last standup" window: anchor to the previous `standup_run`, to a fixed
  previous-workday rule, or per-person to when they last spoke? (Default: previous run,
  fallback previous workday.)
- Cycle handling: surface circular dependencies as a warning lane only, or let the
  facilitator force a manual cut that persists?
- Reviewer edges are softer tie-breaks, not equal to Jira `blocks` edges.
- Person vs item ordering: walk people (Jira-standup style) or walk items grouped by
  owner (planning-space style)? v1 assumes people; the item view may be a sub-mode.
- Do we need an explicit "not at standup today" toggle (pulls from Epic 30 off-days
  automatically)?
- The digest stays in-app for v1. External Slack/Teams posting waits for a pack-provided
  communication surface and reviewable mutation flow.
