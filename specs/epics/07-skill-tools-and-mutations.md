# Epic 07: Skill Tools And Mutations

## Purpose

Skills need tools that can read integrations, persist useful documents, and prepare
reviewable UI for mutations.

The MVP can start as an internal local tool surface. It should be shaped so it can later
be exposed through MCP.

For context-bound chat, tools are part of the visible data view. The view is the shared
object of discussion, not the chat transcript. Read tools inspect the current context.
Mutation tools create live draft edits in the main UI. The user commits or discards
those edits from the UI.

Example:

```text
User is on backlog with chat open.
Agent calls estimate draft tool for PROJ-123.
Backlog row immediately shows the new estimate as dirty with check and X actions.
Nothing is written to Jira until the user accepts.
```

## Tool Surfaces

Tools should be exposed by both the current view and individual elements inside that
view.

Context attachments and cached workspace files should answer broad read needs first.
View-level tools answer live or narrow questions about the current surface.

Examples:

- list visible backlog tickets
- list selected work items
- summarize current filters
- load current ticket comments
- refresh current context bundle

Element-level tools answer questions or draft changes for one target.

Examples:

- get ticket detail for one visible row
- draft estimate change for one ticket
- draft description edit for the open ticket
- draft status or assignee change for a work item

The existing context primitive that powers add-to-chat behavior should evolve in this
direction:

```ts
type AgentContextElementRegistration = {
  resourceRef: ResourceRef;
  context: unknown;
  readTools: string[];
  draftMutationTools: string[];
  mutationTargets: string[];
};
```

The exact API can differ, but the ownership should stay the same: views register broad
capabilities, elements register precise targets.

## Read Tools

- `integration.accounts.list`
- `integration.projects.list`
- `integration.resources.list`
- `integration.resource.get`
- `integration.search`
- `jira.project.issues.list`
- `jira.issue.get`
- `jira.issue.comments.list`

Read tools are safe by default when scoped to the current view or registered element.
They should not require approval and should not automatically widen from "visible
backlog tickets" to "all tickets in project" unless the tool contract explicitly says so.

## Artifact Tools

- `artifact.create`
- `artifact.update`
- `artifact.read`
- `artifact.list`
- `plan.create`
- `plan.update`
- `cache.write`
- `cache.read`

## Mutation Tools

- `mutation.prepare`
- `mutation.preview`
- `mutation.commit`
- `jira.comment.prepare`
- `jira.comment.commit`

Agent-facing mutation tools must prepare draft mutations only. They may update the local
UI immediately, but they must not commit to Jira, GitHub, or another external system.

Commit tools should be unavailable to the agent unless the UI has already captured an
explicit user action for that specific mutation or batch.

Prefer naming that makes this hard to misuse:

- `jira.issue.description.draft_update`
- `jira.issue.estimate.draft_update`
- `jira.issue.status.draft_update`
- `jira.issue.assignee.draft_update`
- `jira.issue.comment.draft_create`

Avoid exposing direct commit names as normal agent tools in context-bound chat.

## Draft Mutation Store

Draft mutations should be centralized so views and elements can render dirty state
consistently.

Suggested shape:

```ts
type DraftMutation = {
  id: string;
  projectId: string;
  viewId: string;
  threadId: string;
  targetRef: ResourceRef;
  field: string;
  patch: unknown;
  sourceToolName: string;
  status: "draft" | "committing" | "committed" | "discarded" | "failed";
  createdAt: string;
  updatedAt: string;
};
```

Flow:

```text
agent calls draft tool
-> draft mutation store records patch
-> affected target refs are notified
-> main view re-renders with dirty state
-> user accepts or discards from the main UI
-> backend commit route writes to integration
-> integration cache refreshes
-> draft becomes committed or failed
```

The tool should not mutate React component state directly.

## UI Primitive Tools

These tools return structured artifact blocks, not arbitrary client-side code.

- `ui.render.table`
- `ui.render.timeline`
- `ui.render.checklist`
- `ui.render.form`
- `ui.render.diff`
- `ui.render.statusBoard`
- `ui.render.dependencyMap`
- `ui.render.testMatrix`
- `ui.render.mutationPreview`

## Mutation UX

External writes should follow this path:

1. Agent prepares draft mutation through a scoped tool.
2. Shell applies the draft to the visible data view.
3. Affected UI elements render dirty state inline.
4. User accepts or discards each change, or uses a batch action such as save all.
5. Shell commits accepted mutations through the backend integration boundary.
6. Shell records result in local history and refreshes cached integration data.

Inline accept should commit that specific change immediately. `Save all` is a shortcut
for committing all pending changes in the current view. Discard stays local and instant.

Examples:

```text
Backlog row estimate changed by agent:
  [new estimate value] [check] [X]

Click check:
  commit that estimate change immediately.

Click Save all:
  commit all pending backlog draft changes.
```

For larger coupled edits, such as a multi-field ticket update, the view may show a
review drawer or grouped pending-change panel. The source of truth is still the main data
view, not a separate chat-only preview.

See [Epic 21: Context Tool Catalog](./21-context-tool-catalog.md) for the first concrete
tool set by project, backlog, my-work, work-item, GitHub activity, and thread surfaces.

## Permission Model

Tool access should be scoped by:

- project
- recipe
- integration account
- selected resource
- read versus write capability

Default stance:

- reads allowed after integration connection
- mutation preparation allowed for matching resources
- mutation drafts are visible immediately in the main UI
- mutation commit requires explicit user action in the UI
- inline accept commits one mutation immediately
- save all commits all pending mutations in the current view

## MCP Direction

The internal tool surface should later map cleanly to MCP server tools.

Do not require MCP for the first MVP if that slows down the UI/product validation. The
important part is to design the contracts with MCP-style tool inputs and outputs.
