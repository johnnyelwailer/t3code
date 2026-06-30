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

Operations are provider-neutral first:

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
t3work.work_items.change_set.draft_create
t3work.work_items.change_set.draft_update
t3work.work_items.change_set.preview
t3work.work_items.change_set.discard
```

Commit tools are not normal agent tools:

```text
t3work.work_items.change_set.commit_approved
```

That commit tool is callable only after the UI records explicit user approval for the
selected operations.

## Workflow Contract

Workflows may use arbitrary project logic before drafting:

```ts
const spec = await workspace.readText("docs/spec.md");
const plan = await agent("Turn this into work items", { schema: WorkItemPlan });

await tools.t3work.workItems.changeSet.draftCreate({
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

- `t3work-jira-agent-mutation-tools` adds Jira draft mutation tools returning a
  `draftMutation` payload with `requiresUserApproval: true`.
- `t3work-jira-draft-ui` adds inline document-diff review UI.

This epic generalizes those ideas from single Jira field drafts to a durable batch
change-set model.

## MVP Slice

1. Define shared schemas for `WorkItemChangeSet` and `WorkItemDraftOperation`.
2. Add draft-create and preview tools for batch work-item operations.
3. Persist change sets locally.
4. Render hierarchy/diff review UI.
5. Allow edit, approve, reject, discard.
6. Add Jira commit adapter for approved create/update/link operations.
7. Record approval hashes and commit results.

Deletes and trusted auto-commit can wait.
