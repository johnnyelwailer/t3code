# Epic 35: Work Item Change Sets

## Purpose

Give agents and workflows one generic way to propose work-item mutations while keeping
external writes reviewable.

This epic is not about adding a new knowledge source, markdown importer, or app-owned
spec parser. Project workflows are programmable TypeScript and may read whatever project
files, prompts, artifacts, or integration context they are allowed to read. The platform
only owns the boundary where a workflow turns intent into local draft changes and where
the user later commits those changes to an external system.

Example:

```text
User: make a workflow that syncs docs/spec.md to Jira epics, stories, and subtasks.
Agent: writes project workflow code.
Workflow: reads docs/spec.md however it wants.
Workflow: emits a work-item change set.
UI: shows local drafts.
User: edits and batch-approves.
Connector: commits approved changes to Jira.
```

## Core Model

A work-item change set is a durable local draft containing proposed operations against
normalized work items.

```ts
type WorkItemChangeSet = {
  id: string;
  projectId: string;
  source: {
    kind: "agent" | "workflow" | "view" | "manual";
    threadId?: string;
    workflowRunId?: string;
    recipeId?: string;
  };
  target: {
    // Existing field name; means work-system connector slug, not AI provider id.
    provider: "jira" | "linear" | "github" | string;
    projectRef: string;
  };
  operations: WorkItemDraftOperation[];
  status:
    | "draft"
    | "partially-approved"
    | "approved"
    | "committing"
    | "committed"
    | "failed"
    | "discarded";
  createdAt: string;
  updatedAt: string;
};
```

Operations are connector-neutral first:

```ts
type WorkItemDraftOperation =
  | {
      kind: "create";
      tempId: string;
      itemType: "epic" | "story" | "task" | "subtask" | string;
      fields: WorkItemDraftFields;
      parent?: WorkItemDraftParent;
    }
  | {
      kind: "update";
      target: WorkItemDraftTarget;
      fields: Partial<WorkItemDraftFields>;
    }
  | {
      kind: "delete";
      target: WorkItemDraftTarget;
    }
  | {
      kind: "link";
      from: WorkItemDraftTarget;
      to: WorkItemDraftTarget;
      linkType: string;
    };
```

Minimum fields:

```ts
type WorkItemDraftFields = {
  title: string;
  description?: string;
  acceptanceCriteria?: readonly string[];
  labels?: readonly string[];
  priority?: string;
  estimate?: { mode: "points" | "hours"; value: number };
  assignee?: { accountId?: string; displayName?: string } | null;
};
```

Temporary IDs let one batch express hierarchy before the external system has real IDs:

```text
create temp:epic-1
create temp:story-1 parent temp:epic-1
create temp:subtask-1 parent temp:story-1
```

## Tool Surface

Existing narrow draft tools stay useful for small edits, but workflows need batch tools:

```text
t3team.work_items.change_set.draft_create
t3team.work_items.change_set.draft_update
t3team.work_items.change_set.preview
t3team.work_items.change_set.discard
```

Commit tools are not normal agent tools:

```text
t3team.work_items.change_set.commit_approved
```

That commit tool is callable only after the UI records explicit user approval for the
selected operations.

## Workflow Contract

Workflows may use arbitrary project logic before drafting:

```ts
const spec = await workspace.readText("docs/spec.md");
const plan = await agent("Turn this into work items", { schema: WorkItemPlan });

await tools.t3team.workItems.changeSet.draftCreate({
  target: { provider: "jira", projectRef: "PROJ" },
  operations: plan.operations,
});
```

The platform must not infer that markdown, Confluence, Jira, or any other source is
special. The workflow decides how to read and transform inputs. The platform validates
and stores the resulting operations.

## Review UX

The review UI is the source of truth before external writes.

Required affordances:

- Tree view for hierarchy: epics -> stories -> subtasks.
- Diff view for updates: old field -> proposed field.
- Per-operation approve, reject, and edit.
- Batch approve selected.
- Clear provider validation errors before commit.
- Commit progress and partial failure recovery.

Example:

```text
+ Epic: Billing MVP
  + Story: Checkout page
    + Subtask: Add Stripe client
    + Subtask: Add empty/error states
~ Story: Receipt email
  description changed
- Subtask: Old PayPal spike
```

## Security Model

Default stance:

```text
Agent/workflow may create local drafts.
Agent/workflow may not commit external work-item mutations.
User approval is required at operation or batch level.
```

Approval records must bind to:

- change-set ID
- approved operation IDs
- approving user
- provider target
- exact operation payload hash
- approval time

If an operation changes after approval, its approval is invalid.

## Trusted Workflows Later

Trusted workflows are a later extension, not MVP default.

A trusted workflow may auto-commit only when all trust constraints match:

```text
workflow file hash matches approved hash
workflow capabilities match approved capability set
provider target matches approved project
operation kinds are allowlisted
blast-radius limits are satisfied
```

Example limits:

```text
can create up to 10 subtasks
cannot delete
cannot move items across projects
cannot change assignee
cannot edit Done items
```

Trust is revoked by workflow file changes, policy changes, provider target changes, or
failed validation that would widen the write scope.

## Relationship To Existing Specs

- [Epic 07: Skill Tools And Mutations](./07-skill-tools-and-mutations.md) defines the
  draft-first mutation principle. This epic makes that principle batchable and
  provider-neutral for work items.
- [Epic 16: Action Recipes](./16-action-recipes.md) launches project workflows from
  surfaces.
- [Epic 21: Context Tool Catalog](./21-context-tool-catalog.md) owns tool catalog
  placement. This epic adds the generic work-item change-set tool family.
- [Epic 25: Workflow Engine](./25-workflow-engine.md) owns programmable workflow
  execution.
- [Epic 32: Project Provider And Tool Policies](./32-project-provider-tool-policies.md)
  gates provider/tool access and future trusted workflow writes.

## Implementation Notes From Existing Branches

The existing draft branches already point in the right direction:

- `t3team-jira-agent-mutation-tools` adds Jira draft mutation tools returning a
  `draftMutation` payload with `requiresUserApproval: true`.
- `t3team-jira-draft-ui` adds inline document-diff review UI.

This epic generalizes those ideas from single Jira field drafts to a durable batch
change-set model.

## Implemented: server half of the grouping (slice 3a)

A change set is a thin grouping over the existing drafts; nothing here writes to Jira.

- `t3_work_item_change_set` (`t3team.work_item.change_set`, group `mutation.draft`) takes a title and
  1 to 25 operations, each a `t3_work_item_draft` argument object, and publishes the N
  `draft-mutation` artifacts plus ONE `work-item-change-set` artifact (`jira-changeset:<uuid>`,
  payload `WorkItemChangeSet` in `packages/contracts`). The publish is all or nothing: validation
  and the project-scope check (once per distinct key, at most 4 live lookups at once, 30 s overall)
  run before any write. On any non-success exit of the write sequence (failed write, defect,
  interrupt) the attempted artifacts are removed from the store; if a removal itself fails, the
  tool result names the draftIds that could not be withdrawn instead of claiming nothing is pending.
- A structurally malformed operation never reaches the broker over `/mcp`: the tool's input schema
  rejects it (one schema error, nothing published). The per-index `operationErrors` list covers
  the broker-level failures: an operation that does not build, or one outside the project.
- The change set records, per operation, `draftId`, `issueKey`, `field`, `summary` and a
  `payloadHash` (SHA-256 of the canonical JSON of the draft's target, field and patch).
  `hashDraftPayload` and `verifyDraftPayloadHash` are synchronous, pure JS (`@noble/hashes`) and
  live in `@t3tools/shared/t3team-workItemChangeSetHash`, so server and clients (including Hermes
  and plain-http LAN web, which have no `crypto.subtle`) agree byte for byte. `packages/contracts`
  keeps the schema and `readWorkItemChangeSetOperationStatuses`.
- Per-operation status is the member draft's own status; the change set carries only
  `draft | discarded`. Discarding goes through the draft status route (`changeSetId`, status
  `discarded`): it dismisses members still in `draft`, leaves `applied` ones, and is idempotent.
  Known limits, accepted in 3a: discard is not transactional against a concurrent per-operation
  apply (a discard can overwrite `applied` with `dismissed` although the Jira write already
  happened); and after a discard a member can still be flipped back to `draft` through the
  per-draft status route.
- Contract for slice 3b: before rendering or applying an operation, verify that its
  `operations[].draftId` is a `draft-mutation` artifact on the same thread. Apply from the MEMBER
  draft's payload, after `verifyDraftPayloadHash(draft, operation)` returns true, never from the
  change set's display copies (`summary`, `issueKey`, `field`).
- Audit: no draft verdict table exists. The artifacts are the record, plus structured log lines
  `t3team.workItemChangeSet.published` and `.verdict`.

Not built: a server commit path (applying runs in the client through the existing accept
handlers), temp-id hierarchy, delete operations, trusted auto-commit, un-discarding.

## Implemented: web half, preview and approval card (slice 3b)

`WorkItemChangeSetMount` (`apps/web/src/t3team/changeset/`) renders every `work-item-change-set`
artifact of a thread above the conversation, inside `ThreadChatView`, so the full thread, the embedded
aside and the right-panel thread tab all show it. It follows the 3a contract:

- Each `operations[].draftId` must be a `draft-mutation` artifact on the SAME thread, else the
  operation reads `missing` and is never sent. A `draftId` listed twice is `duplicate` after its first
  use: shown, never sent. The contract decodes such a payload leniently, so a stored set is never
  dropped. Rows render from the member draft, never from the set's display copies.
- `verifyDraftPayloadHash` runs before every write, in the apply sequencer (`t3team-changeSetApply.ts`,
  pure, injected `acceptOp` and `record`). A mismatch is refused with "Changed since proposed, not
  applied", and a `changed` operation is never counted as approved.
- What the card may write is decided per operation (`t3team-changeSetPolicy.ts`). Status, assignee,
  story points and link removal are pre-approved, shown with their values, and written through the
  work item view's own field writes (`t3team-workItemFieldWrites.ts`). Labels, priority and fix
  versions (add/remove by name, set by name) are idempotent and handled the same way, shown as
  "+bug, -wontfix", "Priority: High", "Fix version: +2.4.0". Every write that creates
  something (comment, subtask, link create) is NOT pre-approved: it needs an explicit tick and shows
  "Creates a new item; check Jira first if a previous apply was interrupted". A comment also shows
  its full text. A description is never written from the card
  (it has no current text to diff, so an accept would silently overwrite a concurrent Jira edit); it
  reads "Review and apply from the work item view". An estimate applies only when the draft says
  `estimateMode: "points"`; hours or an unstated mode is left to the item view.
- Apply is available only when the thread's project source is Jira (`provider: "atlassian"`) with an
  account; otherwise the card says why and writes nothing. A draft whose target is not Jira, or whose
  issue key is outside the bound project key, is refused; a binding without a Jira key is refused as a
  whole (fail closed). A subtask is created in the binding's
  `externalProjectId`, the id the backlog's subtask form uses; without it the subtask is left to the
  item view.
- Operations are independent: a failure stays on that operation and the run continues, except that
  later operations on the same field of the same issue are blocked. Only `draft` operations are
  sent, so a re-run resumes.
- A write that is not repeatable (comment, subtask, link create) whose reply was lost is `uncertain`
  ("may already be in Jira"), not `failed`, unless the server answered with a 4xx status (`BackendApiError.status`). A 5xx, a timeout, a network
  error or anything unknown may have landed, so it is `uncertain`. "Retry failed" skips it, and so
  does any later write to the same field of the same issue. Each uncertain operation offers Retry
  anyway, Already applied (asks to confirm, then records the verdict only) and Dismiss. The hold is
  separate from the outcome: only a recorded verdict, or a retry that succeeds, releases it; a
  failed recording, a refusal or another failure keeps it. Repeatable writes (status, assignee, points, link remove, labels, priority, fix versions) retry normally.
- Verdicts are recorded with a bounded backoff. A write that landed but could not be recorded is
  `unrecorded`: the card warns "applied in Jira but could not be recorded", never sends it again, and
  offers Retry recording. Session outcomes live in a module store (`t3team-changeSetOutcomeStore.ts`)
  and the apply run is plain async code, so unmounting the card neither stops a run nor loses its
  results, and a remounted card cannot start a second run for the same set.
- Per-operation toggles take the policy's default. Apply records `applied` for the approved ones and
  `dismissed` for those the reviewer rejected ("Apply 3 and dismiss 2"); "Discard set" calls the 3a
  `changeSetId` route.
- While a set is `draft`, its members are not ingested into the per-draft review store
  (`ingestThreadDrafts`), so they are not offered twice. A discarded set, or one the card cannot
  render, leaves them to the per-draft review.

Residual risks, accepted for now: the session store is memory only, so a hard reload while an
operation is `unrecorded` or `uncertain` forgets it and the member is `draft` again. Writes that
create something are not pre-ticked for that reason, but a reviewer who ticks one after a reload can
still create a duplicate; check Jira first. Follow-up: a server-side write-ahead marker (an `applying`
status on the draft, recorded before the write) would let a reload see an interrupted apply. It
widens the draft status contract and the status route, so it is not part of this slice. There is no compare-and-set: two tabs or hosts can apply the same set, and the
cross-session guard is not built. A draft written to Jira is also not re-read, so the work item view
shows it after its next fetch.

Not built: delete operations, temp-id hierarchy, a server commit path, trusted auto-commit,
un-discarding, mobile. Known gaps: the card shows proposed values without the current ones, because
the thread has no loaded work item; the per-draft strip's scalar accepts still do not record their
verdict on the carrier (only the description diff does); and that strip passes the app's project id,
not the Jira project id, to `createSubtask`.

## MVP Slice

1. Define shared schemas for `WorkItemChangeSet` and `WorkItemDraftOperation`.
2. Add draft-create and preview tools for batch work-item operations.
3. Persist change sets locally.
4. Render hierarchy/diff review UI.
5. Allow edit, approve, reject, discard.
6. Add Jira commit adapter for approved create/update/link operations.
7. Record approval hashes and commit results.

Deletes and trusted auto-commit can wait.
