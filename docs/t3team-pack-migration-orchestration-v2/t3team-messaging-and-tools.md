# 3.4 Agent messaging and 3.5 MCP tools

Part of the [pack migration guide](../t3team-pack-migration-orchestration-v2.md).

## 3.4 Agent messaging (`t3_thread_send` mailbox mode)

| Before                                                                          | After                                                                                                                                                                      |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `t3team_send_message {to_thread_id, text, summary?, urgent?}`                   | `t3_thread_send {threadId, message, mode: "mailbox", summary?, urgent?, clientRequestId?}`                                                                                 |
| result with `runId`, `status`                                                   | `{threadId, messageId, delivery: "mailbox", note?}`; `runId` / `status` are optional in `OrchestratorMcpThreadSendResult` and absent for mailbox delivery                  |
| `actor`-role message plus a hidden reaction turn, rebuilt from the V1 event log | durable table `t3team_thread_mailbox`; ONE V2 user message per digest                                                                                                      |
| host `T3TeamToolBrokerShape.sendMessage`                                        | _removed_; host code calls `T3TeamActorMailbox.send({senderThreadId, targetThreadId, messageId, text, summary, urgent})` (`apps/server/src/t3team-actorMailboxService.ts`) |

- Same project only; upstream runtime and interaction-mode ceilings apply. Modes `auto`, `queue`,
  `steer`, `restart` keep upstream semantics (`packages/contracts/src/orchestratorMcp.ts`
  `OrchestratorMcpThreadSendInput`; hook `apps/server/src/mcp/t3team-threadMailboxDelivery.ts`).
  A thread cannot mail itself.
- Delivery: when the recipient is idle (no active or queued run), not held, past the coalescing
  window (`T3TEAM_ACTOR_MESSAGE_DEBOUNCE_MS`, default 60 s) unless an entry is urgent, and not
  while the user is typing. Pending entries survive restarts and are delivered by a 5 s sweep.
- Digest message: id `t3team-mailbox-digest:<firstMessageId>:<attempt>`, `createdBy: "agent"`,
  `creationSource: "server"`, `senderThreadId` = first sender, `dispatchMode: queue_after_active`,
  `notification {source: {kind: "background_task"}, outcome: "updated", summary: "N messages from
«…»"}`. Text starts `[Inter-agent digest: N message(s)]` with one `[from «title» · thread … · id
… · urgency …]` block per message (`apps/server/src/t3team-actorReactionFraming.ts`); long
  bodies arrive as subject plus a `t3team_read_message` pointer.
- Injected guidance changed: the standing protocol (first digest per process,
  `ACTOR_STANDING_INSTRUCTION` in `apps/server/src/t3team-actorReactionInput.ts`) and the child
  steering line (`buildHumanSteeringInstruction` in `t3team-actorSteeringContext.ts`) now say not
  to send unrequested progress or completion reports, because a delegated child's final answer
  reaches its parent as the task result. Prompts that quoted the old "exactly one final report"
  sentences must change.
- Loop guard: hop count 0 from a non-digest run, the digest's max hop + 1 from a digest run. Past
  `T3TEAM_ACTOR_MESSAGE_HOP_CAP` (6, a constant) the message is recorded as a run-less user
  message without waking the recipient; `note` explains.
- User stop: a `run_interrupt_request` from a client command id (UUID) or a `t3team-cascade-stop:`
  command id puts the thread (and held lineage descendants) on a durable hold
  (`t3team_thread_mailbox_holds`), lifted by the next human message in that thread
  (`isUserStopCommandId` in `apps/server/src/t3team-actorMessageReactor.ts`). A pack stop cascade
  must keep that prefix. Imported V1 history (event ids `migration:v1:`) never lifts a hold.
- Messages to a recipient that is later deleted are retired (`state: "failed"`); messages to an
  archived recipient wait until it is unarchived. `queued` is not a delivery guarantee.
- `t3team_read_message {message_id}` reads only messages delivered to the calling thread, from
  the mailbox: `{ok, messageId, fromThreadId, createdAt, charCount, text}`. `t3team_children
op: "drain"` delivers the caller's pending mail now when idle, else reports `queued` / `held`.
- Silence watches (`t3team_children op: "watch"`) live in `t3team_thread_silence_watches` and
  notify through the mailbox (ids `t3team-silence:…`). "Stopped" = run ended `failed` /
  `interrupted` / `cancelled`, or the thread was deleted or settled; a run that `completed` closes
  the watch silently; a thread cannot watch itself; watches open at upgrade are not carried over;
  no `thread_silence.*` activities are written (`apps/server/src/t3team-threadSilenceWatch.ts`).

## 3.5 MCP tools

| Removed                                                                             | Use                                                                                                                                                    |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `t3team_start_child`                                                                | `delegate_task` (3.3)                                                                                                                                  |
| `t3team_send_message`                                                               | `t3_thread_send` with `mode: "mailbox"` (3.4)                                                                                                          |
| `t3team_rename_thread`                                                              | `t3_thread_update {threadId, action: "rename", title}`                                                                                                 |
| `t3team_models`                                                                     | `orchestrator_capabilities` (`providers[].providerInstanceId`, `providers[].models[].id` / `options`, `inheritedProviderInstanceId`, `inheritedModel`) |
| `t3team_children` ops `list`, `status`, `wait`, `stop`, `close`                     | 3.3                                                                                                                                                    |
| `t3team_workflow_run`, `t3team_workflow_status`, `t3team_workflow_resume` (aliases) | `t3team_orchestration_run`, `_status`, `_resume` (same parameters)                                                                                     |

Kept (`apps/server/src/mcp/toolkits/t3team/tools.ts`): `t3team_provider_usage`,
`t3team_children`, `t3team_search_thread`, `t3team_search_source`, `t3team_read_message`,
`t3team_orchestration_{run,status,resume,pause,stop}`, `t3team_ask_user`, `t3team_show_widget`,
`t3team_help`, `t3team_recipe_list`, `t3team_recipe_validate`.

Behaviour changes:

- Every `t3team_*` tool except `t3team_help` requires the `orchestration` MCP capability: `This MCP
credential does not grant orchestration capabilities.`
  (`apps/server/src/mcp/toolkits/t3team/handlers.ts`).
- `t3team_ask_user` (parameters unchanged) is a pending V2 runtime request `t3team-ask:<uuid>`
  (`kind: "user_input"`, `responseCapability: {type: "message"}`) on the calling thread's active
  run, plus a `user_input_request` turn item. Outside an active turn it fails (`t3team_ask_user can
only be called during an active turn.`). `context` is prepended to `question`. Answers come
  through upstream `runtime-request.respond {requestId, answers: {[questionId]: string |
string[]}}` (multi-select joined with `•`), dismissal through `thread.user-input.dismiss`;
  Resume is refused while it is open (`apps/server/src/mcp/toolkits/t3team/t3team-askUserWriter.ts`).
- `t3team_search_thread`, `t3team_read_message`, `t3team_search_source` scan V2 messages (roles
  `user` / `assistant` / `system`, no `actor`) and tool turn items (activity `kind` = V2 turn-item
  type, e.g. `command_execution`, `dynamic_tool`); `search_source` follows `fork` lineage
  (`apps/server/src/t3team-toolBrokerThreadReads.ts`). `t3team.view.read`: `latestTurnId` →
  `latestRunId` (`t3team-toolBrokerViewWorkspace.ts`).
- The `[host] memory pressure` line in tool results is advisory only ("do not start new children or
  parallel work; finish in-flight work and end the turn"); `delegate_task` carries it as a result
  note; no turn is held (`apps/server/src/t3team-resourcePressureToolLine.ts`).
- `t3team_help("model-selection")` points at `orchestrator_capabilities` and `delegate_task`
  (`apps/server/src/t3team-workflowManualModelSelection.ts`).

Broker tool ids `t3team.thread.rename`, `t3team.runtime.models`, `t3team.thread.start_child` are
gone from the catalog (`packages/project-context/src/t3teamToolCatalogImplemented.ts`), the recipe
tool groups (`packages/project-recipes/src/toolGroups.ts`) and the broker; a tool context listing
them binds nothing for them. Legacy ids `t3team.workflow.*` / `t3work.*` still resolve
(`apps/server/src/t3team-toolBrokerLegacyToolIds.ts`).
