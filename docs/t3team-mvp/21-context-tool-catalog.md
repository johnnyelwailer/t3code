# Epic 21: Context Tool Catalog

## Direction

Context-bound chat should expose tools that match what the visible `t3team` UI can do.
The agent may also get one level lower than the UI when the result still reflects cleanly
in the UI.

Good tool:

```text
Agent sets backlog to a JQL-backed saved filter.
Backlog visibly switches to that filter.
```

Bad tool:

```text
Agent mutates hidden Jira state that no visible surface can explain or review.
```

Tool outputs and mutations must stay reflectable in the current view.

## One Shared Surface

This catalog is the **Tools** primitive — one of the four shared primitives (Context,
Tools, Workflows, Views) the rest of `t3team` is built on. There is a single tool surface,
brokered by `T3TeamToolBroker`, consumed identically by:

- **agent turns** (the original consumer),
- **workflow `tool`/`script` steps** in action recipes ([Epic 16](./16-action-recipes.md)),
- **miniapp/View tool bridges** ([Epic 19](./19-workspace-miniapps.md)).

Tools began as agent-scoped capabilities, but scripts, workflows, and Views all bind to the
_same_ registry rather than getting parallel APIs. A recipe's `allowedToolGroups` scopes
this surface for everything that recipe runs, and is the single enforcement point for
stage-2 sandboxing. Pre-launch code (recipe visibility, View pre-render) binds in a
no-thread, read-only mode — read tools and resource reads only, no view-state or mutation
tools.

Under the pack-driven model, tools and tool groups may be provided by core, distribution
packs, remote-managed packs, user packs, or project-local source. The broker and policy
engine remain host-owned; pack code never bypasses this catalog.

## Context Files First

`t3team` already has a context attachment model. Attached context is written into the
managed project workspace under `.t3team/context/...`, then the agent can read those
files through normal workspace file access.

The `.t3team/context` path is transitional. Under Epic 36, synced/generated context should
move toward host app-data or another host-owned project store, with the agent receiving
explicit readable paths through the host/tool layer.

That should be the primary read substrate for broad context.

Example:

```text
Ticket detail context is attached.
Files are written under .t3team/context/jira/<project>/items/<key>/...
Agent reads those files directly.
```

This means many "read" tools should not duplicate cached context files. Prefer context
attachments when the agent needs the current project, work item, GitHub activity, or
artifact bundle.

Current project workspace sync behavior:

- project metadata and linked repository URLs are written for work projects with a managed
  workspace root
- loaded Jira/backlog resources are written as per-item **summary** files plus
  `work-items/index.json` only after the relevant view reports loaded data; pre-load empty
  arrays are not published
- each summary file records `availability: "summary"`, `loadableOnDemand: true`, and
  `fullBundleRootRelativePath` pointing at the rich tree location under
  `.t3team/context/jira/<project>/items/<key>/`
- full per-item bundles are **not** written during workspace auto-sync; agents load them on
  demand through `t3team.work_item.refresh_context_bundle`
- `refresh_context_bundle` is server-owned: it checks freshness, fetches the root item plus
  direct links/children, writes the full bundle and commit marker, then starts depth-prioritized
  background expansion for indirect links
- the same refresh path is exposed over HTTP at
  `POST /api/t3team/project/workspace/context-refresh/work-item` for web add-to-chat and
  other clients that need a managed-workspace refresh without rebuilding bundles in the browser
- Jira add-to-chat for work items calls the server refresh route and attaches lightweight
  file references to server-written entrypoints instead of building directory bundles in the
  browser
- ticket-detail slice add-to-chat (description, comments, attachments, relationships, parent)
  uses `POST /api/t3team/project/workspace/context-refresh/work-item-slice` to refresh the
  work-item tree when needed and write `items/<key>/focus/<slice>.json` server-side
- server-side context cache uses content-addressed blobs (CAS) with SQLite metadata; background
  refresh pauses on disk `hardStop` or `softPressure` budgets and may purge cold cache entries
  before resuming
- incomplete background expansion jobs are persisted durably and resumed on server startup
- visible project thread lists are written when project, dashboard, ticket, or standalone
  thread routes are opened
- visible backlog and my-work state is written from the mounted dashboard views; my-work also
  writes loaded GitHub activity when available
- `.t3team/context/entrypoint.json`, `.t3team/context/manifest.json`, and
  `.t3team/context/.sync-commit.json` record paths, availability guidance, and sync/commit
  timestamps for readers

Sync is best-effort but durable while the relevant UI state is mounted. Requests are
debounced per workspace root, repeated payloads are coalesced, and a newer payload replaces
any older queued payload before it writes. Writes are serialized per workspace root, so an
older in-flight write is followed by the latest queued payload instead of racing it. Failed
writes move the internal sync state to `failed`, reject the first attempt for logging, and
retry with bounded backoff while the route/view remains mounted; remounting or changing the
input enqueues again and resumes the attempt. The server writes each file through a temp file
and rename, then writes the commit marker last.

Known limits: the client does not read the existing on-disk files before each render, failed
sync status is currently internal/log-only, and the commit marker is a batch completion hint
rather than a transactional directory swap. If the app is closed before a retry succeeds, the
next mount/input change is what resumes the write. On-demand full sync requires a connected
t3team web client to drain the server queue; without it the tool may return `sync_pending`.
Ticket detail section slices (description, comments, attachments, GitHub activity) are still
assembled client-side for the visible UI; only the full work-item bundle refresh is
server-owned today.

Read tools are still useful when they do one of these:

- refresh or resync the context cache
- answer a narrow query without attaching a large bundle
- expose live view state that is not in files yet
- run lower-level integration queries such as JQL preview
- return small enumerations for UI choices, such as boards, sprints, saved filters, or
  assignable users
- resolve a target before writing a draft mutation

Rule:

```text
If the information is stable enough to attach, write/update context files.
If the information is query-like, live, tiny, or UI-state-specific, use a read tool.
```

Required freshness behavior:

- context-bound thread kickoff attaches a fresh view snapshot
- every side-panel send should check whether attached context is stale
- views that poll or refresh integrations should update the corresponding context bundle
- read tools that return data already cached should include freshness metadata
- agents should see file paths and `syncedAt` timestamps for attached context

## Tool Classes

Read tools:

- safe by default
- scoped to current view or registered element
- no approval
- may refresh visible data or context files
- should prefer returning file references when a context bundle already exists

View-state tools:

- change local route/view state
- safe by default
- reflected immediately in controls, URL, or persisted view state
- examples: filter, sort, group, open ticket, switch view mode

Draft mutation tools:

- create visible local drafts
- never commit external writes directly
- user accepts inline or with `Save all`

External convenience tools:

- may create durable user-owned app objects when low risk
- must open or select the result immediately
- examples: create Jira saved filter and select it

## Project-Level Tools

Current UI basis:

- project dashboard mode switch
- linked repository manager
- project-level GitHub activity
- project context bundle
- project sidebar and thread creation

Useful tools:

```text
t3team.project.attach_context_bundle
t3team.project.refresh_context_bundle
t3team.project.list_linked_repositories
t3team.project.open_dashboard_mode
t3team.project.open_linked_repository_manager
t3team.project.refresh_integrations
t3team.project.create_context_bound_thread
```

Notes:

- `open_dashboard_mode` is a view-state tool. It switches between backlog and my-work.
- `open_linked_repository_manager` opens existing UI, not a hidden mutation.
- `create_context_bound_thread` creates a thread under the current project or view.
- `t3team.project.refresh_context_bundle` is implemented. It rebuilds the lightweight
  project context bundle (`work-items/index.json` plus summary JSON) from the current backlog
  cache or provider, writes through `T3TeamContextRefreshService`, and returns
  `availability: "summary"`. The broker tool and HTTP route
  `POST /api/t3team/project/workspace/context-refresh/project` share the same service.

## Backlog / Work-Item View Tools

These tools describe the current Backlog proof surface. Long term, Backlog is a
pack-provided work-item view using the same tool classes and policy gates.

Current UI basis:

- query search
- assignee filter
- Jira saved filter selection
- sprint board selection
- sprint selection
- refresh data
- view modes: hierarchy, planning, table, ownership
- focus filters
- table grouping
- table sorting and direction
- visible table columns
- collapse or expand groups
- visible ticket list
- inline assignee update
- inline estimate update
- create subtask

Read tools:

```text
t3team.backlog.attach_view_context
t3team.backlog.refresh_view_context
t3team.backlog.read_view_state
t3team.backlog.list_visible_items
t3team.backlog.read_hierarchy
t3team.backlog.read_planning_lanes
t3team.backlog.read_ownership_groups
t3team.backlog.read_table_state
t3team.backlog.list_boards
t3team.backlog.list_sprints
t3team.backlog.list_saved_filters
t3team.backlog.search_assignable_users
```

Use context files for larger loaded item data. Use the list/read tools for current view
state, derived UI presentations, and small query results.

View-state tools:

```text
t3team.backlog.set_query
t3team.backlog.set_assignee_filter
t3team.backlog.set_saved_filter
t3team.backlog.set_board
t3team.backlog.set_sprint
t3team.backlog.set_view_mode
t3team.backlog.set_focus_filter
t3team.backlog.set_table_grouping
t3team.backlog.set_table_sort
t3team.backlog.set_visible_columns
t3team.backlog.collapse_groups
t3team.backlog.expand_groups
t3team.backlog.refresh
t3team.backlog.open_item
```

Draft mutation tools:

```text
t3team.backlog.item.assignee.draft_update
t3team.backlog.item.estimate.draft_update
t3team.backlog.item.subtask.draft_create
```

Near-term lower-level Jira tools:

```text
t3team.backlog.jql.preview
t3team.backlog.jql.open
t3team.backlog.saved_filter.draft_create
t3team.backlog.saved_filter.create_and_open
```

`jql.preview` returns a count and sample issue keys before opening the result. `jql.open`
loads the backlog from a JQL selection and reflects it in the backlog controls as a custom
query-backed view.

`saved_filter.create_and_open` may be automatic when it only creates a new Jira saved
filter for the current user and then selects it in the backlog. It should still create a
visible activity event because it writes an external user-owned object.

Examples:

```text
User: "Show only unassigned bugs in review or QA."
Agent:
  t3team.backlog.jql.preview
  t3team.backlog.saved_filter.create_and_open
Result:
  Backlog selects "Unassigned review bugs" and shows matching issues.
```

```text
User: "Put these three subtasks at 2h each."
Agent:
  t3team.backlog.item.estimate.draft_update x3
Result:
  Three rows show dirty estimate values with check and X controls.
```

## My Work View Tools

Current UI basis:

- text query
- view modes: grid, list, kanban
- grouping: hierarchy or flat
- status category
- show/hide Jira items
- show/hide GitHub activity
- advanced filters: type, priority, exact status
- reset filters
- open work item
- visible work items
- unmatched GitHub activity

Read tools:

```text
t3team.my_work.attach_view_context
t3team.my_work.refresh_view_context
t3team.my_work.read_view_state
t3team.my_work.list_visible_items
t3team.my_work.list_metrics
t3team.my_work.list_kanban_columns
t3team.my_work.read_parent_child_groups
t3team.my_work.list_github_activity
t3team.my_work.list_unmatched_github_activity
```

View-state tools:

```text
t3team.my_work.set_query
t3team.my_work.set_view_mode
t3team.my_work.set_group_mode
t3team.my_work.set_status_category
t3team.my_work.set_show_jira_items
t3team.my_work.set_show_github_activity
t3team.my_work.set_type_filter
t3team.my_work.set_priority_filter
t3team.my_work.set_exact_status_filter
t3team.my_work.reset_advanced_filters
t3team.my_work.open_item
```

Draft mutation tools should reuse item-level tools when the target is a Jira work item:

```text
t3team.work_item.assignee.draft_update
t3team.work_item.estimate.draft_update
t3team.work_item.status.draft_update
```

Examples:

```text
User: "Show my review work as a kanban."
Agent:
  t3team.project.open_dashboard_mode({ mode: "my-work" })
  t3team.my_work.set_status_category({ value: "review" })
  t3team.my_work.set_view_mode({ value: "kanban" })
```

## Work Item Detail Tools

Current UI basis:

- ticket metadata
- parent and related links
- description
- attachments
- comments
- GitHub activity section
- activity/context bundles
- reload ticket detail
- open related ticket

Read tools:

```text
t3team.work_item.attach_context_bundle
t3team.work_item.refresh_context_bundle
t3team.work_item.read_view_state
t3team.work_item.read_attachment
t3team.work_item.reload
```

Metadata, description, comments, relationships, and GitHub activity should normally come
from the attached work-item context bundle. Dedicated read tools are for refreshing,
view state, or individual assets that are not already present in text form.

`t3team.work_item.refresh_context_bundle` is implemented. It validates `ticket_key` against
the on-disk `work-items/index.json` for the current project workspace, rebuilds only when
missing/stale unless `force: true` is passed, and returns the ticket entrypoint path with
`availability: "full"` only after the direct bundle is fully written. Background expansion
uses depth as the primary priority: depth 1 before depth 2, depth 2 before depth 3, and so on.
The broker tool and HTTP route share `T3TeamContextRefreshService`; structured server logs
record refresh status, included/skipped counts, queue depth, budget pauses, supersede events,
and startup job resume.

### Bundle schema alignment (server vs web)

Server-owned refresh (`buildT3TeamWorkItemContextBundle` on the server) and the legacy
browser builder (`buildTicketContextBundle` on web) intentionally differ on a few manifest
fields while sharing paths and availability enums from `@t3tools/project-context`:

| Field             | Server refresh                              | Web legacy builder                                                 | Notes                                                                                                                |
| ----------------- | ------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `bundleDepth`     | `direct` (root) / `node` (expanded)         | `full`                                                             | Server depth tracks graph expansion; web marks client-built trees as fully materialized.                             |
| `contextScope`    | omitted                                     | root manifest + entrypoint only                                    | Selection summary (parent chain, skipped relations, GitHub count) is client-only today.                              |
| `github-activity` | omitted                                     | `items/<key>/github-activity/index.json` when activity is supplied | GitHub activity in full bundles is still assembled in the browser; server refresh does not fetch inbox activity yet. |
| `focus/*.json`    | written for ticket-detail slice add-to-chat | omitted on full work-item refresh only                             | Slice add-to-chat uses `context-refresh/work-item-slice` to write focus entrypoints server-side.                     |

Agents should treat `availability: "full"` plus a server-written entrypoint as authoritative
for on-demand work-item refresh. Summary project bundles use `availability: "summary"` until
`t3team.work_item.refresh_context_bundle` loads the rich tree.

View-state tools:

```text
t3team.work_item.open_related_item
t3team.work_item.focus_section
t3team.work_item.expand_section
t3team.work_item.create_context_bound_thread
```

Draft mutation tools:

```text
t3team.work_item.description.draft_update
t3team.work_item.comment.draft_create
t3team.work_item.status.draft_update
t3team.work_item.assignee.draft_update
t3team.work_item.estimate.draft_update
t3team.work_item.priority.draft_update
t3team.work_item.labels.draft_update
t3team.work_item.link.draft_create
t3team.work_item.link.draft_remove
t3team.work_item.subtask.draft_create
t3team.work_item.attachment.draft_add
```

MVP should start with tools already close to implemented backend behavior:

- comment draft create
- assignee draft update
- estimate draft update
- subtask draft create

Description, status, priority, labels, links, and attachments need edit metadata and
field capability checks before being exposed.

Example:

```text
User: "Rewrite this description as acceptance criteria."
Agent:
  t3team.work_item.read_description
  t3team.work_item.description.draft_update
Result:
  Description section shows proposed replacement inline with accept and discard controls.
```

## GitHub Activity Tools

Current UI basis:

- linked repositories
- project GitHub activity
- matched activity per work item
- unmatched activity section
- pull request context bundles and assets

Read tools:

```text
t3team.github.attach_activity_context
t3team.github.refresh_activity_context
t3team.github.list_linked_repositories
t3team.github.list_project_activity
t3team.github.list_work_item_activity
t3team.github.read_pull_request_context
t3team.github.read_pull_request_files
t3team.github.read_pull_request_assets
t3team.github.list_unmatched_activity
```

View-state tools:

```text
t3team.github.open_activity_item
t3team.github.attach_activity_to_chat
t3team.github.link_activity_to_work_item.draft_update
```

Commit behavior:

- reading PR context is safe
- linking GitHub activity to a work item should be a visible draft first unless it only
  updates local matching metadata
- GitHub comments, reviews, labels, or PR changes are external mutations and need draft
  UI first

## GitHub Pull Request Workspace Tools

These tools extend GitHub activity from a context attachment surface into a first-class
PR workspace.

Current UI basis:

- PR detail page with pinned gates and actions
- diff workspace with file tree, search, and unresolved-thread navigation
- selection-aware chat and handoff entry points
- recipe launchers on PR detail, diff selection, and review comment threads

Read tools:

```text
t3team.github.read_pull_request_overview
t3team.github.read_pull_request_activity
t3team.github.read_pull_request_checks
t3team.github.read_pull_request_file_tree
t3team.github.read_pull_request_diff_manifest
t3team.github.read_pull_request_diff_chunk
t3team.github.read_pull_request_selection_context
t3team.github.read_review_thread
t3team.github.read_check_run_details
```

View-state tools:

```text
t3team.github.open_pull_request
t3team.github.select_pull_request_item
t3team.github.set_pull_request_activity_filters
t3team.github.set_pull_request_diff_filters
t3team.github.attach_pull_request_selection_to_chat
t3team.github.start_child_from_pull_request_selection
```

Draft mutation tools:

```text
t3team.github.issue_comment.draft_create
t3team.github.review_comment.draft_create
t3team.github.review_reply.draft_create
t3team.github.review_summary.draft_create
t3team.github.reviewers.draft_update
```

Commit behavior:

- reading PR detail, diff, checks, and selection context is safe
- comment, reply, review-summary, reviewer, and label changes stay draft-first
- repository file changes stay in session/worktree flows, not direct PR UI mutation
- multi-comment review submissions should be previewed as a review package before commit

## Thread And Handoff Tools

Context-bound chat and standalone chat share thread tools.

Useful tools:

```text
t3team.runtime.models
t3team.runtime.provider_usage
t3team.view.read
t3team.recipe.list
t3team.recipe.validate
t3team.orchestration.run
t3team.orchestration.status
t3team.orchestration.resume
t3team.orchestration.pause
t3team.orchestration.stop
t3team.widget.show
t3team.thread.rename
t3team.thread.search
t3team.thread.search_source
t3team.thread.read_message
t3team.thread.read_current
t3team.thread.rename.draft_update
t3team.thread.create_context_bound
t3team.thread.start_child
t3team.thread.children
t3team.thread.send_cross_thread_message
t3team.thread.attach_context
t3team.thread.open_full_page
```

`t3team.runtime.models`, `t3team.view.read`, `t3team.thread.rename`, `t3team.thread.search`,
`t3team.thread.search_source`, `t3team.thread.read_message`, `t3team.thread.start_child`,
`t3team.thread.children`, `t3team.orchestration.run`, `t3team.orchestration.status`,
`t3team.orchestration.resume`, `t3team.orchestration.pause`, and `t3team.orchestration.stop` are
the current live runtime slice used by the broker implementation. The rest of this section
remains planned catalog scope.

`t3team.orchestration.pause` / `t3team.orchestration.stop` give the agent the same controls the
run card gives the user, scoped to the runs its own thread launched (GHE #403): pause parks a
waiting or scheduled run and keeps its continuation for `resume`; stop cancels the run and
interrupts its child agent turns — the way to retire a superseded run before launching its
replacement.

`t3team.runtime.models` reads the current thread's true `ModelSelection` plus every configured
provider instance and model from the live `ProviderRegistry` snapshots. Agent authors call it
before naming an exact provider/model in `start_child` or an orchestration; the SDK deliberately
ships no curated model tree.

`t3team.runtime.provider_usage` samples the provider's LIVE rolling plan-limit windows —
complements the transcript-based consumption reporting: it asks each configured provider
instance (Claude via the Anthropic OAuth usage endpoint, Codex via the app-server's
`account/rateLimits/read`) how much of its 5-hour and weekly quota is used, when the window
resets, and the severity verdict against the host thresholds. Instances that cannot be
sampled come back in `unavailable` with a reason, so one bad provider never hides the rest.

`t3team.thread.search` searches the transcript of the CURRENT thread (case-insensitive
substring, optional `limit` and `role` filter), returning each match with its 1-based
position, role, a snippet, and `message_id` — so a coordinator can recover a prior
decision that scrolled out of the (compacted) context window and follow up with
`t3team.thread.read_message` for the full body. It reuses the same scan/snippet helper
as `t3team.thread.search_source`.

`t3team.thread.search_source` searches the full transcript of the thread the current
thread was forked from (the fork provenance note carries the source thread id), so the
middle of a truncated fork stays reachable.

`t3team.thread.read_message` reads the full body of a previously delivered inter-agent
message in the current thread. Long inter-agent bodies are truncated on delivery to a
short preview plus a marker carrying the message id; the full body stays persisted on the
first-class `actor`-role message and this tool retrieves it on demand.

`t3team.thread.start_child` keeps the `t3team` tool id, but uses session-style input and
result vocabulary aligned with Copilot session tooling:

- `name` for the child session title
- required `isolation` (`shared` or `own-worktree`)
- optional `kickoff_prompt`
- optional `kickoff_mode` (`plan`, `interactive`, `autopilot`)
- optional `model` and `reasoning_effort`
- `repo_full_name` required for `own-worktree` scope when the workspace has linked repositories (omit it in a local workspace to isolate the child in a worktree of the local repository), and forbidden for `shared` scope
- result metadata including `project_session_id`, navigation hint, and repo/worktree details

`shared` means the project's shared checkout — the workspace that holds project context,
references, recipes, skills, and cross-repository synthesis. `own-worktree` means a
dedicated branch + worktree: of the linked implementation repository when
`repo_full_name` is passed, or of the local repository in a local workspace.

`t3team.thread.children` is ONE meta tool for managing a thread's child sessions, selected
by an `op` parameter (`list`, `status`, `wait`, `stop`, `close`, `help`) rather than five
separate tools — the context cost stays one compact description no matter how many ops
exist, and per-op detail is discovered on demand via `help` or a malformed call's error
message. It is STATE (child liveness / completion), not content: child→parent content still
flows through `send_message`. Read-only state (list/status) is derived by the shared
`deriveThreadRunStatus` primitive (the same source the sidebar needs); `wait` is a durable
wait (a registered activity + a reactor that resolves it on the child's terminal event or a
timeout), not a poll loop.

The first live slice creates project-level child sessions with durable parent/child
activity cards. Visual parent-thread or work-item attachment metadata remains planned.

`start_child` is agent-started and does not require user approval in the MVP. The created
child thread must be visible in navigation and receive the chosen context immediately.

## Tool Safety Matrix

```text
Read current view data             auto-run
Change local view state            auto-run
Refresh visible data               auto-run
Create Jira saved filter + open    auto-run, visible activity event
Create local thread/context        auto-run, visible navigation/event
Draft Jira field edit              auto-draft, user commits
Commit Jira field edit             UI action only
Post Jira/GitHub comment           UI action only
Change Jira status/priority        draft first, UI action only
Change repository files            standalone agent/worktree flow
```

## Implementation Notes

Start from existing code paths:

- `t3team-agentContext.ts` already defines add-to-chat style capabilities.
- `t3team-contextAttachmentSync.ts` writes context attachments into the managed workspace.
- `T3TeamContextRefreshService` owns on-demand server refresh; Jira work-item add-to-chat calls
  `refreshWorkItemContextBundle` → HTTP `context-refresh/work-item` and attaches server-written
  entrypoint references without browser bundle building.
- Ticket-detail slice add-to-chat calls `refreshTicketDetailContextBundle` → HTTP
  `context-refresh/work-item-slice` and attaches server-written focus entrypoints.
- `t3team-contextAttachmentSyncPlan.ts` already models sync plans and freshness progress.
- `t3team-threadToolContext.ts` already defines a small thread tool context.
- `ProjectDashboardBacklogView` owns backlog view state and handlers.
- `useProjectBacklog` exposes board, sprint, saved filter, refresh, assignee, estimate,
  and subtask actions.
- `ProjectDashboardMyWorkView` owns my-work filters and mode state.
- `TicketDetailMainColumn` already registers section context menus for metadata,
  parent, description, attachments, comments, references, and GitHub activity.

The next implementation should grow the common registry behind `T3TeamToolBroker` so these
surfaces expose tools without each tool calling component state directly. The broker already
binds a per-thread tool surface for agents; scripts, workflow steps, and Views bind to the
same registry (with a no-thread, read-only binding for pre-launch code).

Recommended flow:

```text
view/element registers tools
-> context-bound thread receives tool manifest + view snapshot
-> agent calls tool
-> tool dispatcher validates scope
-> read/view-state/draft mutation store updates
-> UI re-renders from normal state
```

### Manual validation (context refresh)

1. Open a managed t3team project with Jira linked and a ticket in the sidebar.
2. Start or focus a project chat thread, right-click a ticket, and choose **Add to chat**.
3. Confirm the attachment shows a server entrypoint under
   `.t3team/context/jira/<project>/items/<key>/entrypoint.json` and no long browser-side
   file-write progress for the bundle body.
4. In server logs, confirm `t3team.contextRefresh refresh started/finished` with
   `includedCount` / `skippedCount` and optional `backgroundQueued`.
5. Re-add the same ticket without `force` and confirm `already_synced` / cached progress text.
6. Restart the server with an in-flight background job and confirm
   `t3team.contextRefresh background resume on startup` in logs.

Live script (mock Jira, no paid API):

```bash
node scripts/t3team-context-refresh-e2e-workspace.mjs
T3TEAM_PAIRING_TOKEN=<token> node scripts/t3team-context-refresh-e2e-live.mjs
```
