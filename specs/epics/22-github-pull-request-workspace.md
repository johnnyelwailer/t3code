# Epic 22: GitHub Pull Request Workspace

## Position

Current `t3work` GitHub integration is context-first, not workspace-first.

That is enough for linking GitHub activity to Jira work items and for attaching pull
request bundles to chat, but it is not enough for doing review work inside `t3work`.
The next GitHub phase should treat pull requests as first-class resources with their
own built-in project View, diff workspace, selection-aware chat/handoffs, and
recipe-driven mutation flows.

This should build on the additive GitHub route and context-bundle work that already
exists. Do not introduce direct browser-to-GitHub access. Do not clone the GitHub UI
one screen at a time. Build the workbench that makes PR review and follow-up faster
than GitHub for the workflows that matter most.

## Goals

- replace GitHub link-outs with a first-class PR detail and diff experience
- make large-review navigation faster than native GitHub
- keep review gates, blocking conditions, and common actions pinned at the top
- default activity to newest-first and unresolved-first workflows
- let users attach any review object to chat or a child session
- provide built-in recipes for review, reply, requested-changes handling, and follow-up
- make the same PR workspace adapt to the active user profile
- add adjacent authoring, deployment, and release actions around PR work
- keep all external writes reviewable and explicit
- stay additive to the current `t3work` boundaries and provider contracts

## Non-Goals

- replace every GitHub repository setting or admin screen
- add browser-side Git operations or direct repository editing in the PR UI
- bypass draft-first behavior for comments, reviews, labels, or reviewer changes
- require real-time subscriptions in the first rollout
- optimize around public marketplace exposure before the internal product shape is right

## Current Baseline

The existing additive slice already gives us the raw ingredients:

- server routes load PR metadata, files, reviews, comments, commits, diff text, and file
  snapshots
- web code already turns PR context into durable bundle artifacts for chat and handoffs
- ticket detail and dashboard views already surface related GitHub activity
- GitHub activity already extracts Jira-style work item keys from PR titles, branches, and
  repositories, then groups activity by work item for the project shell
- linked-repository child-session tooling already understands when implementation or PR
  work needs a repository-scoped worktree instead of the project metarepo

The missing layer is the interactive PR workspace:

- a dedicated PR detail route
- a performance-first diff view with a real file browser
- selection-aware chat and handoff entry points
- recipe launchers and draft mutation flows tuned for review work
- a normalized PR resource model that joins GitHub state, linked Jira context, local
  checkout/worktree state, and agent/tool permissions
- mutation routes for review comments, reviews, thread replies, thread resolution, and
  refresh/check-for-new-comments flows

## Implementation Fit Against The Current Codebase

Direct answer: yes, there is already a diff-viewer stack in the base app, but it is a
checkpoint/thread diff viewer, not a t3work pull-request viewer. We should reuse the
underlying rendering stack and shell patterns, not import the whole component unchanged.

### Reuse Now

Existing `t3work` GitHub read pipeline already covers much of the raw data work:

- `apps/server/src/t3work-github-routes-pr-context.ts`
  - loads PR metadata, files, reviews, issue comments, review comments, commits, whole
    diff text, and file snapshots
- `apps/server/src/t3work-github-routes-pr-files.ts`
  - already fetches base/head file snapshots for changed files
- `apps/server/src/t3work-github-routes.ts`
  - already exposes additive HTTP route seams under `/api/t3work/github/*`
- `apps/server/src/t3work-github-inbox-routes.ts`
  - already provides a polling-oriented GitHub activity surface

Existing `t3work` artifact and summary generation is also reusable:

- `apps/web/src/t3work/t3work-githubPullRequestContextBundle.ts`
- `apps/web/src/t3work/t3work-githubPullRequestContextRender.ts`
- `apps/web/src/t3work/t3work-githubPullRequestContextBundleRender.ts`
- `apps/web/src/t3work/t3work-githubPullRequestContextAssets.ts`

These files already prove that `t3work` can normalize PR context into durable artifacts,
summary markdown, asset downloads, and add-to-chat payloads.

Existing `t3work` UI shell/state patterns are also directly relevant:

- `apps/web/src/t3work/t3work-AppMainContent.tsx`
  - current t3work route/view resolution surface
- `apps/web/src/t3work/hooks/t3work-usePersistedRouteState.ts`
  - persisted route/search state pattern for t3work-specific views
- `apps/web/src/t3work/t3work-ResizableRightSidebarLayout.tsx`
  - ready-made dense split-view layout for detail + right-side sidecar shells
- `apps/web/src/t3work/components/ui/t3work-*`
  - additive t3work UI primitives already aligned with the current shell

The base T3 app already has a strong diff-rendering technology stack:

- `apps/web/src/components/DiffWorkerPoolProvider.tsx`
  - worker-backed diff rendering and theme synchronization
- `apps/web/src/components/DiffPanelShell.tsx`
  - panel shell and loading states for a dense diff surface
- `apps/web/src/components/ChatMarkdown.tsx`
  - shared code highlighting stack built on `@pierre/diffs`

There is also reusable source-control and PR authoring logic in the base app:

- `apps/web/src/lib/gitReactQuery.ts`
  - PR resolution and PR-thread preparation query/mutation helpers
- `apps/web/src/components/PullRequestThreadDialog.tsx`
  - pull-request reference resolution and local/worktree preparation flow
- `apps/web/src/components/GitActionsControl.logic.ts`
  - branch-state-driven create/open PR action logic
- `apps/server/src/git/GitManager.ts`
  - provider-backed PR resolution and worktree preparation
- `apps/server/src/git/GitWorkflowService.ts`
  - server routing layer for those Git workflows

### Reuse, But Not As A Drop-In

`apps/web/src/components/DiffPanel.tsx` is not a direct `t3work` PR viewer.

It is tightly coupled to:

- thread route params
- checkpoint diff query options
- `useTurnDiffSummaries`
- chat-specific diff search params
- thread/git-status assumptions tied to the current chat experience

So the plan should be:

- reuse the underlying `@pierre/diffs` stack, worker pool, shell styling, and toggle
  patterns
- avoid importing the full `DiffPanel` into `t3work`
- either extract one small generic patch-render primitive from it, or build a
  `t3work`-prefixed PR diff viewer that copies only the generic rendering slice

Likewise, the base source-control UI should not be pulled wholesale into `t3work` PR
pages. Reuse the logic and small dialogs, not the whole Git panel or settings surface.

### Net-New Build Required

The codebase does not currently have these pieces and they should be built as new
`t3work` surfaces:

- first-class PR detail route and view type in `t3work`
- PR overview/activity/checks query hooks for the in-app PR page
- shell-owned PR blocks for overview, gates, linked resources, activity, checks, diff,
  review threads, worktree state, and sidecar sections so the first implementation is
  already reusable by project-local Views
- linked Jira work-item resolver for PR titles, branches, body text, commits, and project
  configured key patterns
- PR resource context builder that packages GitHub PR data, Jira work-item bundle,
  related work items, branch checkout metadata, comments, review threads, checks, and
  diff refs for agent turns
- a performance-first PR file tree with grouping, filtering, and navigation state
- review-thread grouping and selection-aware context capture
- backend diff manifest and lazy diff-chunk endpoints
- selection-context endpoints for comment/thread/line-range/check attachments
- draft mutation UI for replies, review packages, reviewer changes, and PR-body preview
- mutation endpoints for posting issue comments, review comments, review summaries,
  replies, and resolving or unresolving review threads where the provider supports it
- deployment, release, and rollout context reads such as `where is this deployed`
- project-convention PR template resolution and preview

## Recommended Technologies

### Web

Use the existing app stack rather than introducing a second frontend architecture.

- React 19 for the PR workspace UI
- TanStack Router for route/search state
- PR overview, activity, checks, and diff data flows through the \*\*shared local SQL cache
  - `Queryable<T>` model\*\* defined in [Epic 16 — Context: Reactive Queryable Surface](./16-action-recipes.md#context-reactive-queryable-surface).
    GitHub data syncs into namespaced tables in the existing
    [`effect/sql` persistence layer](../../apps/server/src/persistence/Layers/Sqlite.ts);
    the web UI consumes it via the same queryable surface that powers recipe discovery and
    Views, with projection-driven reactivity rather than URL-keyed HTTP cache invalidation.
- `@pierre/diffs` and `@pierre/diffs/react` for patch parsing, syntax highlighting,
  `FileDiff`, and hunk virtualization
- `DiffWorkerPoolProvider` for worker-backed diff parsing/rendering
- `@legendapp/list/react` for very large file-tree virtualization when the left tree grows
  beyond a simple mapped list
- `@tanstack/react-pacer` for debounced file filtering, search, and expensive derived-state
  recalculation
- existing `t3work` UI primitives and layout components for detail/side-panel shells

Do not add Monaco or CodeMirror in phase 1. The repository already ships a diff-oriented
rendering stack, and a second editor/diff stack would increase bundle size and duplicate
functionality before we have proven the product shape.

### Server

Use the existing additive `Effect` HTTP route model.

- keep new GitHub endpoints in `apps/server/src/t3work-github-*.ts`
- continue using `VcsProcess` and the current GitHub REST-fetching path for reads
- keep the polling and conditional-fetch approach from Epic 18 for the first rollout
- reuse `GitWorkflowService` and `GitManager` for repository-aware PR authoring/worktree
  actions instead of rebuilding branch/PR orchestration inside `t3work`

Do not add a new websocket or subscription layer in phase 1. Do not introduce a second
GitHub client stack unless the current REST path proves insufficient for a specific read
surface.

### Data Contracts

Prefer one response contract per major surface:

- PR overview
- PR activity
- PR checks
- diff manifest
- diff chunk
- selection context
- deployment/release context

If shared-schema duplication between server and web starts growing, move the normalized
schemas into an additive shared home rather than continuing to duplicate server-local and
web-local type files.

## Additive Delivery Boundary

This work should stay inside the same additive boundary discipline as the rest of
`t3work`.

### Web Boundary

- new runtime code should live in `apps/web/src/t3work/**`
- add a new `t3work` PR route/view type inside the existing `t3work` view-resolution flow,
  not inside the base chat diff route
- use `t3work-usePersistedRouteState` and existing split-view layout patterns for PR-level
  navigation/search/filter persistence
- implement the built-in PR workspace as a composition of reusable `t3work` blocks first,
  then mount those blocks in the default View; do not hard-code a monolithic PR page that
  later has to be split for customization

### Server Boundary

- new GitHub HTTP routes should live in `apps/server/src/t3work-github-*.ts`
- extend the existing `t3work-github-routes.ts` family instead of scattering GitHub logic
  across generic server files
- keep third-party reads behind those backend routes; browser code should continue to call
  `t3work` backend methods only

### Upstream Touch Policy

To stay aligned with the additive guard and keep the OG T3 surface small:

- do not edit `apps/web/src/components/DiffPanel.tsx` unless a tiny reusable extraction is
  clearly lower risk than copying the generic render slice into a `t3work` file
- do not edit generic Git/source-control UI for `t3work` presentation concerns
- reuse existing PR lookup/creation/worktree services through thin wrappers or adapters
  instead of duplicating them in `t3work`
- if one upstream seam is unavoidable, it should be small and plausibly upstreamable, such
  as a generic patch-render primitive or a single merged `t3work` GitHub route layer seam

### Practical Implementation Order

1. Stay inside `specs/epics/**`, `apps/web/src/t3work/**`, and
   `apps/server/src/t3work-github-*.ts` for the first implementation slice.
2. Land the PR detail shell first by reusing the current pull-request-context route and
   current artifact vocabulary.
3. Add diff-manifest and diff-chunk routes next, then build the `t3work` PR diff viewer on
   top of the existing diff worker/render stack.
4. Reuse the existing Git workflow services for PR creation/worktree actions before adding
   any new GitHub mutation service.
5. Defer any websocket/core runtime seam work until the HTTP + polling shape proves
   insufficient.

## Composable View Model

The PR workspace should be built as a default shell View composed from the same primitives
defined in Epic 16, Epic 19, and Epic 31. Do not invent a separate "PR app" abstraction.

Vocabulary alignment:

- **View / miniapp**: the composable UI unit. The default PR workspace is a built-in View,
  and teams can later create project-local PR Views under `.t3work/miniapps/*`.
- **Block**: shell-owned React component used by Views. Blocks own density, loading,
  empty/error states, accessibility, and safe data hooks.
- **Surface**: where recipes and sections appear, such as
  `github.pull_request.detail.sidepanel`, `github.pull_request.diff.selection`, and
  `github.review.comment`.
- **Sidecar section**: a miniapp at `sidecar.section`, not a special hard-coded sidebar.
- **Recipe**: the launcher users click.
- **Workflow**: the `.workflow.ts` program the recipe runs.

Initial PR block library:

- `PullRequestView`
- `PullRequestHeader`
- `PullRequestGateShelf`
- `PullRequestLinkedResources`
- `PullRequestDescription`
- `PullRequestActivityFeed`
- `PullRequestChecksPanel`
- `PullRequestFileTree`
- `PullRequestDiffViewer`
- `PullRequestReviewThreadList`
- `PullRequestReviewDraftPanel`
- `PullRequestWorktreeState`
- `PullRequestRecipeSection`
- `PullRequestContextAttachmentList`
- `PullRequestFreshnessStatus`

Composition rules:

- the default PR page uses these blocks internally from day one
- blocks read shell-owned queryables and context, not raw GitHub/Jira clients
- each block declares the high-level capabilities it needs through the same View manifest
  model as other miniapps
- teams can reorder, hide, or replace sections through project-local Views without
  reimplementing GitHub auth, caching, mutations, or diff parsing
- built-in blocks should be dogfooded in the default View before exposing a customization
  surface

Example project-local View direction:

```tsx
import {
  PullRequestActivityFeed,
  PullRequestDiffViewer,
  PullRequestGateShelf,
  PullRequestLinkedResources,
  PullRequestRecipeSection,
  PullRequestView,
  PullRequestWorktreeState,
} from "@t3work/blocks";

export default function TeamReviewView() {
  return (
    <PullRequestView density="compact">
      <PullRequestGateShelf />
      <PullRequestLinkedResources providers={["jira", "confluence"]} />
      <PullRequestWorktreeState />
      <PullRequestDiffViewer focusMode="unresolved" />
      <PullRequestActivityFeed filters={["new-since-last-visit", "human-comments"]} />
      <PullRequestRecipeSection topic="review" />
    </PullRequestView>
  );
}
```

## User Problems To Solve

- link-outs break project context and force users to rebuild state in another tool
- users want website-level PR parity for review work: description, checks, commits, files,
  review threads, comments, branch state, and all relevant actions in one place
- referenced Jira work items are easy to miss, so reviewers lose product and acceptance
  context before reading the diff
- agents do not get enough context unless the user manually gathers PR diff, comments,
  branch checkout, linked ticket details, and related work
- checks, mergeability, requested changes, and blockers are buried instead of surfaced
- native GitHub activity order is poor for triage when the newest state matters most
- large diffs are hard to navigate, search, and filter quickly
- users cannot cleanly hand a single comment, thread, or line range to an agent
- follow-up work such as replying, implementing feedback, or summarizing review state is
  fragmented across multiple tools
- bot noise, generated files, and low-signal updates drown out the real work

## Primary Surfaces

### PR Cards And Queues

GitHub pull requests should appear as first-class items in project and my-work views.

Minimum card payload:

- title, repo, PR number, author, updated time
- draft/open/merged/closed state
- review status summary
- failing/pending/passing check counts
- linked work items
- unresolved-thread count
- personalization badges such as assigned reviewer or requested changes

These cards should open an in-app PR detail view by default. Opening GitHub in the
browser becomes a secondary action, not the primary navigation path.

### Pull Request Detail

The detail page should optimize for decision-making before diff reading.

Required sections:

- pinned header with title, repo, branches, author, reviewers, mergeability, and quick
  actions
- gate shelf with requested changes, failing checks, merge queue/conflict state, and
  blocked reviewers
- description and linked-resource summary, including Jira work items resolved from title,
  branch, body, commits, and project mapping rules
- branch/worktree shelf showing whether the PR branch is checked out locally, where the
  agent worktree lives, base/head SHAs, and whether the local checkout is stale
- activity feed with comments, review events, commits, checks, and state transitions
- quick-launch recipe rail for review and follow-up workflows

Default activity behavior:

- newest to oldest by default
- unresolved threads and requested changes surfaced before passive history
- filters for reviews, review comments, issue comments, commits, checks, bots, and only
  my-relevant items
- a `since last visit` mode that suppresses already-seen history

Personalization options should include:

- hide or collapse bot/system noise
- prioritize threads involving me or my team
- pin a preferred default filter/view preset per user or project
- expand unresolved threads automatically while keeping resolved threads folded

Parity target:

- users can stay in `t3work` for normal review work without opening GitHub
- GitHub remains the escape hatch for repository settings, unusual admin actions, and
  provider features that do not yet have safe draft-first mutations
- every outbound write shows the exact payload, target repository, PR number, acting
  account, and provider URL before commit

Minimum tab model:

- `Overview`: status, linked Jira context, description, review state, checks, and recipes
- `Files`: file tree, diff, inline threads, line-range attachments, and review draft
- `Conversation`: issue comments, review summaries, review threads, commits, checks, and
  timeline events with newest-first filters
- sidecar sections: recipes, active threads, current context package, worktree state, and
  pending drafts. This is the right-side **sidecar**, composed from `sidecar.section`
  miniapps, not an extra hard-coded tab.

### Profile-Aware Presentation

The active profile should shape both the UI defaults and the recipes shown on the same
pull request.

This must be preference-driven, not profile-name-driven. UI logic should use fields such
as technical depth, guidance style, detail density, artifact preferences, and action
family preferences. It must not special-case built-in profile ids or titles.

Examples:

- high technical depth + expert guidance + expert detail density: diff-first navigation,
  raw check details, code-owner and file-state emphasis, technical recipes ranked first
- guided guidance style + summary-first detail density + release/deployment action
  preference: summary-first landing state, guided change buckets, and
  checks/blockers/deployments emphasized
- low technical depth + short brevity + aggressive low-signal collapse: plain-language
  explanation, linked work-item impact, rollout status, and quieter system-event noise

Rules:

- users can temporarily switch presentation mode per PR view without losing the underlying
  project or account default
- profile changes rerank actions and adjust explanation density immediately
- deep links to files, comments, and checks remain stable across profile modes
- custom user-defined profiles must work without any code changes as long as they provide
  the expected preference fields

### Diff Workspace

The diff view is the highest-risk surface for performance regressions, so the spec must
optimize for very large pull requests from the start.

Required behaviors:

- a sticky, searchable file tree that works well for thousands of files
- flexible grouping by path, status, review state, code owner, or custom focus modes
- fast keyboard navigation across files, hunks, comments, and search matches
- unified and side-by-side diff modes
- unresolved-thread and requested-change navigation shortcuts
- line, hunk, file, and thread deep links that remain stable across chat and handoffs

Required focus modes:

- unresolved only
- requested changes only
- files with comments
- failing-check annotations only
- generated or vendor files hidden
- changed since last visit or since the latest review request

## Performance Envelope

The PR diff experience must follow measurable constraints.

Targets:

- render the PR shell from cached summary data without waiting for full diff hydration
- keep file-tree filter and selection interactions under 50 ms on large PRs
- render the first selected file diff from warm cache without parsing the full PR patch
- keep path/status search responsive on large file manifests
- never mount the full diff DOM for every file at once

Design rules:

- backend returns a normalized diff manifest first, not only one giant diff blob
- per-file or per-hunk content is fetched lazily and cached separately
- file tree and hunk lists are virtualized
- generated, binary, and oversized files use summary cards instead of raw rendering
- search indexes are built from manifest metadata first and enriched incrementally
- scroll position, search state, and open-thread state persist per file while navigating

## Selection-Aware Context For Chat And Handoffs

Any GitHub review object should be attachable to chat and to child sessions.

Planned reference kinds:

```ts
type GitHubPullRequestSelectionRef =
  | { provider: "github"; kind: "pull_request"; repository: string; pullRequestNumber: number }
  | {
      provider: "github";
      kind: "review_thread" | "review_comment" | "issue_comment";
      repository: string;
      pullRequestNumber: number;
      commentId: string;
      threadId?: string;
    }
  | {
      provider: "github";
      kind: "file" | "diff_hunk" | "diff_line_range";
      repository: string;
      pullRequestNumber: number;
      path: string;
      side?: "base" | "head";
      startLine?: number;
      endLine?: number;
      commitSha?: string;
    }
  | {
      provider: "github";
      kind: "check_run" | "check_suite";
      repository: string;
      pullRequestNumber: number;
      checkId: string;
    };
```

Context rules:

- attaching a thread should include the full thread, nearby diff, and current review state
- attaching a line range should include exact line anchors, surrounding hunk context, and
  nearby comments
- attaching a check should include status, failing annotations, and relevant file anchors
- child-session handoffs should optionally carry `repo_full_name`, base/head SHA, and the
  exact selection ref so the child can open the right worktree context immediately
- agent responses should deep-link back to the selected comment, line range, or file
- worktree handoffs should pin the exact checkout directory and branch/ref state used for
  the agent turn

Illustrative reference forms:

```text
@github:owner/repo/pull/123
@github:owner/repo/pull/123#review-comment=456
@github:owner/repo/pull/123#file=apps/web/src/foo.ts&start=88&end=103
```

## Linked Jira Context

Any PR with a Jira-style work item reference should automatically become a compound work
object, not just a GitHub object with a loose badge.

Resolution inputs:

- PR title, body, branch name, commit messages, and repository/project configured key
  patterns
- current `t3work` project backlog cache and rich work-item context bundle
- explicit user-added links when automatic matching is ambiguous

Context package:

- primary work item summary, acceptance criteria, description, comments, attachments, and
  status
- parent epic, subtasks, blockers, related issues, linked PRs, and recent ticket activity
- confidence score and evidence for each inferred link
- stale/missing markers when the Jira bundle needs refresh

Rules:

- automatic matches can attach read context without user friction
- ambiguous matches show a small picker before becoming primary context
- agents receive both the raw refs and rendered summaries so they can cite exact sources
- writes to Jira remain separate draft-first mutations; a PR recipe must not silently
  update ticket status or comments while posting GitHub review output

Example:

```text
PR title: "ABC-123 fix retry loop for cancelled sessions"
Primary context: ABC-123
Related context: parent epic, linked bug, previous PRs touching same component
Agent package: Jira bundle + full PR diff + unresolved review threads + checkout path
```

## Agent Sidecar And Worktree Context

The PR page should behave like ticket detail: main work object on the left, agent sidecar
on the right.

Sidecar responsibilities:

- show quick recipes ranked for PR state, profile, linked work item, and selected object
- show current context attachments before launch
- show existing child sessions tied to the PR and linked work item
- expose refresh buttons for PR context, Jira context, checks, and local checkout state
- surface pending draft mutations for review before any GitHub or Jira write
- mount as composable `sidecar.section` miniapps so teams can reorder, hide, or replace
  sections per project/profile

Agent context must include:

- full PR overview, description, files manifest, diff chunks or full diff refs, comments,
  reviews, review threads, commits, and checks
- linked Jira work-item bundle and relatives
- repository identity, base/head SHAs, branch names, remote URLs, and provider host
- local worktree path for the checked-out PR branch when an implementation recipe needs
  code access
- project recipes, coding conventions, prior artifacts, and relevant knowledge-base refs

Checkout rules:

- review-only recipes may run from cached PR artifacts without checkout
- implementation or comment-handling recipes must prepare a repository-scoped worktree
  using existing linked-repository services
- checkout state is visible and refreshable; stale head SHA blocks write/implementation
  flows until the user refreshes or accepts the stale context
- generated branches and commits stay on the user's fork/remotes per the repository's PR
  policy

## Recipes And Draft Mutations

GitHub PR work should be action-first, not prompt-first.

Built-in recipe candidates:

- review this PR for regressions, risk, and test gaps
- summarize what changed since my last visit
- explain what this PR does
- explain this review thread or comment in plain language
- draft a reply for this thread
- implement requested changes in a child session/worktree
- convert requested changes into a checklist artifact
- prepare a merge-readiness or QA handoff summary
- draft a PR body using the project template
- show where this PR is deployed
- summarize deployment or release blockers
- refresh PR context and show new comments since last agent run
- resolve threads that are addressed by this branch, with draft review summary
- learn from this merged PR and propose project knowledge updates

Mutation policy stays consistent with the broader `t3work` model:

- comments, replies, review summaries, label changes, reviewer changes, and similar
  GitHub writes are draft-first
- repo code changes happen in child sessions/worktrees, not by editing the diff in place
- the UI must show the exact outbound GitHub payload before commit
- multi-comment review submissions should be previewed as one review package, not as a
  hidden sequence of calls
- resolving review threads is draft-first and must show which thread IDs will change
- refresh/check-for-new-comments is read-only and can run automatically on a low-frequency
  poll, but notification and auto-recipe launch require explicit project settings

Minimum GitHub mutation capabilities:

- create issue comment on the PR conversation
- create review comment on a file/line/range
- reply to an existing review comment/thread
- submit a pending review with approve/comment/request-changes state
- dismiss or edit drafts before submission
- resolve and unresolve review threads when the provider API and permissions allow it
- request or remove reviewers where project policy permits it

Example review package:

```text
Action: "Handle comments"
Input: 4 unresolved review threads
Agent output:
- code changes in /worktrees/owner-repo-pr-123
- draft replies for 3 threads
- 1 thread marked "needs human decision"
- review summary payload preview
User commits GitHub writes only after preview.
```

## Freshness And Notifications

Phase 1 should use explicit refresh plus polling, not a new realtime dependency.

Required freshness states:

- PR metadata stale
- diff stale because head SHA changed
- comments stale because new activity exists
- checks stale or still running
- Jira context stale
- local checkout stale compared with PR head

Refresh actions:

- refresh PR now
- refresh comments only
- refresh checks only
- refresh linked Jira context
- update local worktree to current PR head

Notification plan:

- first rollout: project-configured polling and `new since last visit` indicators
- later: provider webhook/subscription adapter if polling cost or latency becomes a real
  problem
- no automatic agent work from new comments until the user enables a specific recipe rule
  such as `when reviewer comments appear, prepare a draft response checklist`

## Merged PR Learning Workflow

Merged PRs are valuable project memory. This is a recipe-backed workflow, not a new
runtime primitive: a user clicks a recipe, or a project routine triggers after merge, and
the `.workflow.ts` body scans the PR, extracts candidate knowledge, and proposes
reviewable updates.

Recipe shape:

- surface: `github.pull_request.detail.sidepanel`
- optional routine trigger: merged PR polling or provider event, implemented as a normal
  scheduled workflow/routine from Epic 27
- workflow: `.workflow.ts` using PR context, linked Jira context, approved artifacts, and
  knowledge tools
- output: a durable artifact plus reviewable knowledge-base mutation drafts

Inputs:

- merged PR diff, commits, checks, review comments, issue comments, and final review state
- linked Jira work item and related ticket context
- agent artifacts and draft mutations that were approved or rejected
- final branch/worktree changes and test evidence

Outputs:

- durable `merged-pr-learning` artifact linked to the PR, work item, repository, and
  creating workflow run
- extracted patterns such as recurring review comments, accepted fixes, risky files,
  missing tests, preferred reviewer language, and project conventions
- candidate Knowledge Workbench updates that require user review before becoming shared
  project knowledge, following Epic 26's maintain-knowledge model

Rules:

- do not train silently from private code or comments
- distinguish facts from inferred conventions
- store citations back to PR comments, commits, file paths, and Jira refs
- approved knowledge becomes normal project context/tool-catalog data that implementation
  and review agents can query later
- recipe completion should offer to save/tune the workflow as a project-scoped action
  recipe when the user repeats the flow, following the existing save-as-recipe rule

Example:

```text
Merged PR ABC-123/#456:
- Reviewer repeatedly asked for cancellation-path tests.
- Final fix added tests in apps/server/src/session/*.test.ts.
- Candidate knowledge: "For session cancellation changes, include retry and cancelled
  subprocess tests."
```

## Adjacent Authoring And Ops Slice

The next GitHub slice should not stop at review. PR-centered work also includes authoring,
release readiness, and deployment context.

### PR Authoring Actions

Users should be able to ask `t3work` to help create a PR from the current branch,
worktree, or child-session result.

Requirements:

- resolve PR template conventions in order: project override, repository default,
  organization/team template, then fallback
- prefill linked work items, summary, change buckets, test evidence, rollout notes, and
  reviewer hints when available
- let the user edit and preview the outbound PR body before creation
- support draft PR creation and normal PR creation through the same reviewable flow
- keep template rules project-scoped so teams can vary by repository, branch, or project

### Deployment, Release, And Ops Actions

PR work often turns into `what changed`, `where is this deployed`, and `is this safe to
ship` questions.

The PR workspace should expose action families for:

- explanation: what this PR does, who it affects, and what changed since last review
- deployments: preview, staging, production, or release-train status for the PR head SHA
- release: blockers, checks, runbook links, release-note drafts, and handoff artifacts
- ops: environment links, monitoring pointers, rollback context, and known follow-up work

These actions should prefer structured outputs over prose dumps. For example:

- deployment status table
- release-readiness checklist
- rollout blocker summary
- plain-language PR explanation

Profile and skill-pack selection should rerank these action families. Engineering users
may want raw CI and diff details first, while verification or release users may want a
guided explanation, environment status, and test checklist before the raw patch.

## Native GitHub Pain Points To Improve

The first-class PR experience should explicitly target the common GitHub frustrations.

- newest-first review activity instead of oldest-first archaeology
- blockers and merge gates pinned at the top instead of buried across tabs
- one command surface for files, comments, checks, and recipes
- faster file tree filtering and navigation for very large PRs
- `since last visit` and `since latest review request` views
- easy hiding of bot churn, generated files, and low-signal updates
- unresolved-thread and requested-change workflows as primary modes
- clear explanation of why a PR is blocked, not only that it is blocked
- direct handoff from a selected review object to an agent child session

## Additive Architecture

This work should stay inside the existing additive boundaries.

Backend responsibilities:

- GitHub API access, normalization, caching, conditional requests, and mutation prepare
  flows
- summary, activity, checks, diff-manifest, and diff-chunk endpoints
- selection-context reads that package the exact object the user selected

Web responsibilities:

- PR routes, list/detail/diff rendering, file-tree state, and personalization state
- selection capture, context attachment, recipe launch, and draft review UI
- no direct third-party network calls

Cache layers should separate:

- PR summary snapshot
- activity snapshot
- checks snapshot
- diff manifest
- per-file or per-hunk diff chunks
- selection-context snapshots

This separation keeps refresh cheap and avoids reloading the entire PR whenever only one
sub-surface changed.

## Rollout

### Phase 1: PR Detail Workspace

- add a first-class PR detail route
- reuse existing PR context routes and artifact vocabulary where possible
- surface gates, actions, newest-first activity, and recipe launchers
- keep diff access link-first or artifact-first if needed while the detail shell lands

### Phase 2: Performance-First Diff Workspace

- introduce diff manifest and lazy diff chunk reads
- add the flexible file tree, search, and keyboard navigation
- support comment/thread anchors and unresolved navigation

### Phase 3: Selection-Aware Agent Workflows

- attach comment, file, hunk, line-range, and check selections to chat
- launch child sessions from PR selections with repository/worktree context
- add built-in recipes for review, reply, and requested-changes handling

### Phase 4: Personalization And Advanced Review Flows

- profile-aware presentation switching
- saved view presets
- `since last visit` state tracking
- reviewer/team-focused prioritization
- richer check annotations and review-package previews

### Phase 5: PR Authoring And Ops Actions

- add project-convention PR creation flows
- add explain-this-PR actions
- add deployment and release context actions such as `where is this deployed`
- add structured release and rollout artifacts tied to the PR

## Validation

The implementation is only complete when it proves both usability and performance.

Browser validation:

- open a large PR without leaving `t3work`
- confirm blockers and actions are visible without tab hunting
- switch between engineering and verification-style profiles on the same PR and confirm
  the presentation and action ranking update immediately
- confirm activity defaults to newest-first and unresolved navigation works
- search and filter the file tree at large scale without noticeable lag
- attach a selected comment and a selected line range to chat
- start a child session from requested changes and verify the child receives the exact PR
  selection context
- launch a PR authoring flow with a project template and verify the outbound body preview
- run `where is this deployed` and verify the result is structured and linkable

Engineering validation:

- unit coverage for normalization, manifest building, caching, and personalization state
- component and Storybook coverage for PR cards, detail header, activity feed, and diff
  viewer states
- snapshot coverage for dense PR screens and narrow layouts
- real-browser walkthrough on both desktop and mobile-width layouts
