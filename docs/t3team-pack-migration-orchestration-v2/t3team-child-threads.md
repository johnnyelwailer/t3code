# 3.3 Child threads

Part of the [pack migration guide](../t3team-pack-migration-orchestration-v2.md).

## `t3team_start_child` → `delegate_task`

`delegate_task {task, title?, role?, target?, workspace?, extensions?, mode?, timeoutMs?,
clientRequestId?, runtimeMode?, interactionMode?}` (`OrchestratorMcpDelegateTaskInput` in
`packages/contracts/src/orchestratorMcp.ts`; service `apps/server/src/mcp/OrchestratorMcpService.ts`).

| `t3team_start_child`                                                                                 | `delegate_task`                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`                                                                                               | `title`                                                                                                                                                                             |
| `kickoff_prompt`                                                                                     | `task` (required)                                                                                                                                                                   |
| `kickoff_mode: "plan"`                                                                               | `interactionMode: "plan"` (other kickoff modes: omit)                                                                                                                               |
| `isolation: "shared"`                                                                                | omit `workspace` (or `{isolation: "inherit"}`)                                                                                                                                      |
| `isolation: "own-worktree"`                                                                          | `workspace: {isolation: "worktree"}`                                                                                                                                                |
| `repo_full_name` / `repo_ref`                                                                        | `workspace.repository` / `workspace.baseRef`                                                                                                                                        |
| `provider` / `model`                                                                                 | `target.providerInstanceId` / `target.model`                                                                                                                                        |
| `reasoning_effort`                                                                                   | `target.options` (option ids from `orchestrator_capabilities`)                                                                                                                      |
| `effort` (`light` / `standard` / `high`)                                                             | `extensions.effort`                                                                                                                                                                 |
| `ticket_id`                                                                                          | `extensions.ticketId`                                                                                                                                                               |
| `environment {id, label?}`                                                                           | `extensions.environment {id, label?}`                                                                                                                                               |
| result `project_session_id`, `navigate_to`, `effort_note`, `environment_note`, `setup_script_status` | upstream task result (`taskId`, `childThreadId`, `status`, `workState`, `summary`, …) plus `notes: string[]` (branch, worktree, setup script, effort, environment, memory pressure) |

- Upstream policy: the caller needs an active run owned by its MCP session ("Delegated tasks
  require an active run owned by this MCP provider session.") and may not escalate runtime or
  interaction mode. `orchestrator_capabilities.delegation` lists `workspaceIsolation` and the
  accepted `extensions` keys; unknown keys are rejected
  (`apps/server/src/t3team-delegateTaskExtensions.ts`).
- A `worktree` child gets its own branch and worktree and does not inherit the parent's pull
  requests; a shared-checkout child does. A rejected or child-less dispatch removes the worktree
  and branch that call created. A retry with the same `clientRequestId` returns the existing
  child without re-running setup.
- Kickoff framing removed: the child's first message is exactly `task` (with `role`, upstream
  prefixes `Act as the <role> sub-agent for this task.`). The child's last assistant message is the
  task result the parent receives. Prompts must not tell children to report back with
  `t3team_send_message` or `t3_thread_send`.

## Status, wait, cancel

| Before (`t3team_children`, now `t3_task_ops`)   | After                                                                                       |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `op: "list"`                                    | `t3_thread_list {includeSubagents: true}`                                                   |
| `op: "status"`                                  | `task_status {taskId}` / `t3_thread_read`                                                   |
| `op: "wait"`                                    | the automatic completion wake (below), or `delegate_task mode: "wait"`, or `t3_thread_wait` |
| `op: "stop"`                                    | `task_cancel {taskId}` / `t3_thread_interrupt`                                              |
| `op: "close"`                                   | nothing                                                                                     |
| params `on`, `all`, `include_settled`, `reason` | removed                                                                                     |

Remaining ops: `watch`, `unwatch`, `sweep`, `drain`, `environments`, `help`
(`apps/server/src/t3team-toolBrokerChildrenTypes.ts`). A call with a removed op answers with its
replacement.

## Relations and metadata

- Parent/child is V2 lineage: `shell.lineage.parentThreadId`, `relationshipToParent: "subagent" |
"fork"`. Ticket and visible placement: `T3TeamChildThreadMetadata.listByChildThreadIds`
  (`apps/server/src/t3team-childThreadMetadata.ts`); cross-environment binding: thread fact
  `environment`. `t3team.handoff.*` activities are gone.
- `POST /api/t3team/thread/placements` keeps its shape but returns `parentThreadId` only for
  delegated children with a metadata row (`apps/server/src/t3team-thread-placement-routes.ts`).
- `subagent` children are not idle-days / PR-merge auto-settle candidates; they settle with their
  parent through the child settle sweeper (`apps/server/src/t3team-childSettleSweeper.ts`). A child
  with any explicit settle override is never auto-settled. Give pack-created helper threads
  `subagent` lineage if they should settle and stop with their parent (3.7).
- Child status summary: thread fact `childStatus` (+`childStatusUpdatedAt`), from finished V2 turn
  items of app-owned `subagent` children only (`apps/server/src/t3team-childStatusReactor.ts`).
- The child-cleanup nudge is gone (env `T3TEAM_CHILD_CLEANUP_NUDGE_AT`,
  `T3TEAM_CHILD_CLEANUP_NUDGE_COOLDOWN_MS`); schedule a reminder yourself if you need one.

## Child updates to the orchestrating parent

The fork's child-wait, abnormal-stop, silent-completion and cleanup notices are gone. The single
mechanism is upstream's **delegated-completion wake**: one per terminal state (`completed`,
`failed`, `cancelled`, `interrupted`), durable, batched per parent run, dispatched
`queue_after_active` to the parent and delivered to a pack provider as a `startTurn`
(`createdBy: "agent"`, `creationSource: "server"`). Async delegations always wake the parent;
`mode: "wait"` delegations wake only when the parent has no live run.

Default text (`delegatedCompletionWakeDetail` in `apps/server/src/orchestration-v2/Orchestrator.ts`):
`Delegated task <id> reached a terminal state. Use task_status with taskId <id> to read the result.`

An orchestrator model that relied on rich child notices registers a renderer (capability
`completion-wake-renderer:v1`; one per host, also honoured from the compiled-in distribution;
`packages/t3team-pack-api/src/completion-wake.ts`,
`apps/server/src/t3team-pack-completionWakeRenderer.ts`):

```ts
context.defineCompletionWakeRenderer({
  render: ({ defaultText, tasks }) =>
    tasks.length === 0
      ? defaultText
      : tasks
          .map((t) => `[child ${t.title ?? t.taskId}] ${t.status}\n${t.result ?? "(no result)"}`)
          .join("\n\n"),
});
```

- `input = {threadId, parentRunId, defaultText, tasks: [{taskId, childThreadId, title, status,
result}]}`; `result` is the child's last assistant message.
- The rendered text is stored on the wake message and is the provider's turn input. A wake whose
  task set changed while queued is rendered once more when its run starts, so a renderer may run
  twice per wake: render only from the `tasks` given, never from cached state.
- Keep it fast and side-effect free: a rejection, an empty or non-string result, or a render over
  5 s keeps `defaultText`, and a slow render delays that wake's turn by up to 5 s. A queued wake a
  user promotes to steer is delivered with the default text.
- Failed children are not retried by the host: the parent gets the failure wake and decides
  (`task_status`, `t3_thread_send`, a new `delegate_task`).
- A silence watch on the watcher's own delegated child closes silently when the child's run
  fails or is interrupted; the completion wake is the one report.

## Host-side delegation hook

`Context.Reference` `DelegatedTaskPreparation {workspaceIsolation, extensions, prepare(input) →
{modelSelection, workspace?, notes, afterCreate(childThreadId), release?}}`
(`apps/server/src/mcp/t3team-delegatedTaskPreparation.ts`). The host provides ONE implementation,
`T3TeamDelegatedTaskPreparationLive` (`apps/server/src/t3team-delegateTaskPreparationLive.ts`), to
the MCP server layer in `apps/server/src/server.ts`. Distribution code that adds delegation
options wraps it rather than providing a second override, forwards `release` (run when the
dispatch fails or creates no child), and must not rely on `afterCreate` running per call (it runs
once per child). Likewise `packCompletionWakeRendererLive` is the one
`DelegatedCompletionWakeRenderer` override (`apps/server/src/t3team-v2/t3team-delegatedCompletionWakeRenderer.ts`);
a renderer may read projections (`getThreadRecords(parentThreadId, ["subagents"])`) but never
dispatches.
