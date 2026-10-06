# 3.6 Thread facts and artifacts, 3.7 run-less messages and lineage, 3.8 settle guards

Part of the [pack migration guide](../t3team-pack-migration-orchestration-v2.md). The services
below are host Effect services: a runtime pack cannot reach them through `PackActivationContext`;
compiled-in distribution or host code uses them from layers wired in `apps/server/src/server.ts`.
Pack clients read their results through the side streams (3.12).

## 3.6 Thread facts (side stream)

Fork-only thread state no longer rides the thread shell. `T3TeamThreadFacts`
(`packages/contracts/src/t3team-threadFacts.ts`): `workflowRunStatus`, `sleepingUntil`,
`activityLabel` (+`UpdatedAt`), `childStatus` (+`UpdatedAt`), `environment`, `retention`
(`ephemeral` | `retained`), `resourcePressurePaused`, `extensions` (record).

| V1 shell field                                                                                   | Now                                                                    |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| `workflowRunStatus`, `sleepingUntil`, `activityLabel`, `childStatus`, `environment`, `retention` | fact of the same name                                                  |
| `activityState`                                                                                  | not persisted; clients derive it from V2 turn items (3.12)             |
| `backgroundLiveness`, `hasOpenChildWait`                                                         | shell `pendingBackgroundTasks` (kind `subagent` = waiting on children) |
| `planProgress`                                                                                   | V2 `todo_list` plans                                                   |

- WS `t3team.subscribeThreadFacts {threadId?}`: snapshot, then `upsert` / `removed`; gated by
  `capabilities.t3team.threadFacts`. The all-threads snapshot leaves out deleted threads; a deleted
  thread's facts are removed.
- Write: `T3TeamThreadFactsStore.upsert(threadId, patch)`
  (`apps/server/src/t3team-v2/t3team-threadFactsStore.ts`). Pack-owned facts go under
  `patch.extensions["<pack>.<fact>"]` (`null` deletes a key). The upsert FAILS with
  `T3TeamThreadFactsStoreError` when the stored row does not decode under the running build;
  writers log and skip. Keys a newer build wrote survive an upsert.
- Nothing writes `resourcePressurePaused` yet: there is no V2 turn gate for memory pressure.

## 3.6 Thread artifacts (side stream)

`T3TeamThreadArtifact {id, threadId, messageId | null, kind, payload, createdAt, updatedAt}`
(`packages/contracts/src/t3team-threadArtifacts.ts`); `kind` matches `^[a-z][a-z0-9._-]{0,63}$`
(use `<pack>.<name>`). WS `t3team.subscribeThreadArtifacts {threadId}`, gated by
`capabilities.t3team.threadArtifacts`. Write: `T3TeamThreadArtifactsStore.upsert` with a
deterministic id and optional `createdAt` (new artifacts only); `removeByThread` runs on
`thread.deleted` (`apps/server/src/t3team-v2/t3team-threadArtifactsStore.ts`).

| Before (message `t3teamExt`, V1 activity)                 | Artifact                                                                                                                                                         |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| hidden system message with a `widget` attachment          | `{id: "widget:<widgetId>", kind: "widget", messageId: null, payload: T3TeamMessageWidgetAttachment}`                                                             |
| hidden `jira-draft:<carrierMessageId>` carrier message    | `{id: "jira-draft:<uuid>", kind: "draft-mutation"}`; verdict via `POST /api/t3team/thread/draft-mutation/status {threadId, draftId \| carrierMessageId, status}` |
| decision cards, plan/shape views, resource and draft refs | ONE `{id: "message-ext:<messageId>", kind: "message-ext", payload: T3TeamMessageExt}`                                                                            |
| activity `t3team.recipe.workflow.step`                    | `{id: "t3team-wf-step:<stepId>", kind: "t3team.recipe.workflow.step", payload: {tone, summary, payload}}`                                                        |
| activity `t3team.recipe.launch`                           | same id (`t3team-recipe-launch:<runId>`), kind and payload, written through `host.upsertActivity`                                                                |

The web client renders only some kinds (3.12); put pack cards on a `message-ext` or `widget`
artifact.

## 3.6 User-message ext

A user message's `T3TeamMessageExt` (work-item attachments, `widgetReply`, `workflowReply`,
`displayText`, `visibleToUser`, workflow `author`) rides the V2 message `context.records` as one
record of kind `t3team-message-ext`; it is never sent to the provider and is dropped when over
64 KB. Write with `withT3TeamMessageExtContext(ext, context?)`, read with
`readT3TeamMessageExtContext(message.context)` (`packages/contracts/src/t3team-messageExtContext.ts`).

## 3.7 Run-less messages and lineage writers

| Before                                                            | After                                                                                                                                                                                         |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V1 `thread.message.upsert`                                        | `T3TeamThreadMessageRecorder.record({threadId, messageId, role, text, context?, senderThreadId?, createdBy?, creationSource?})` (`apps/server/src/t3team-v2/t3team-threadMessageRecorder.ts`) |
| V1 `thread.actor.message`                                         | `T3TeamActorMailbox.send` (3.4)                                                                                                                                                               |
| `t3team.handoff.*` activities, fork relation SQL                  | `T3TeamThreadLineage.setThreadLineage({threadId, parentThreadId, relationshipToParent: "subagent" \| "fork"})` (`apps/server/src/t3team-v2/t3team-threadLineage.ts`)                          |
| `thread.turn.resume`                                              | `message.dispatch {manualContinuationOfRunId, dispatchMode: {type: "start_immediately"}}`                                                                                                     |
| automated turn-start admission (reject while busy)                | dispatch with `queue_after_active`; never pre-check busy                                                                                                                                      |
| restart wake steer, restart hold summary turn                     | upstream `RestartContinuation` / `RestartBackgroundNote`; no restart block in turn input                                                                                                      |
| `POST /api/t3team/thread/fork` (transcript copy, provenance note) | upstream `thread.fork` (client `forkThreadFromRun`) or MCP `t3_thread_fork` / `t3_thread_merge_back`: `relationshipToParent: "fork"`, inherited timeline, no copied messages                  |

- The recorder is idempotent on `messageId` (pass a deterministic one). Role `system` renders as a
  `system_notice` with turn item id `t3team:turn-item:<messageId>` and does not steer titles; do
  not hand-build that id prefix. It takes the thread lock itself, so never call it from inside a
  dispatch for the same thread. Defaults: `createdBy` user → `user`, assistant → `agent`,
  system → `system`.
- Give pack-created helper threads `subagent` lineage if they should settle and stop with their
  parent, and the fact `retention: "ephemeral"` to keep them out of rosters.
- Lineage writes fail with `T3TeamThreadLineageError` (`reason: "refused"` for self-parent, cycles,
  deleted or unknown threads; `"failed"` otherwise).

## 3.8 Settle guards

- V1 engine settle preconditions (`requireSettledParentThreadId`, live-child, workflow and
  parent-wait guards) → one `Context.Reference` `T3TeamSettleGuard {check({threadId, commandId,
origin: "user" | "server"}) → reason | null}` (`apps/server/src/t3team-v2/t3team-settleGuard.ts`),
  consulted for every user `thread.settle`, every auto-settle, and by the settlement sweep before
  it dispatches (a refused thread is skipped, no rejected receipt).
- The host provides ONE override, `T3TeamSettleGuardsLive`
  (`apps/server/src/t3team-childSettleGuards.ts`). It refuses on an unfinished workflow run, a live
  `subagent` child, an unfinished delegated task or one whose completion is still pending for an
  unsettled parent, or (settled-parent sweeps) a parent that is no longer settled. Texts changed,
  e.g. `Thread X has a live child thread and cannot be settled.`
- Add checks by composing them with `combineSettleGuards(...)` inside that one layer; checks must
  be read-only and lock-free. There is no runtime pack hook.
