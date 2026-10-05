# 3.1 Provider SPI runtime and 3.2 model policy

Part of the [pack migration guide](../t3team-pack-migration-orchestration-v2.md). Types, lifecycle,
events and the skeleton are on the [provider SPI page](t3team-provider-spi.md).

## Job-completion wakes

| Before                                                                                                            | After                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| The pack self-started a provider turn and stamped `thread.metadata.updated{lastJobNotification}` for host framing | `PackOpenSessionInput.host.requestContinuation({threadId, providerThreadId, detail, notification?, delivery?})` |

The host (`ProviderContinuationRequests.offer`, mapped in `t3team-pack-driverAdapter.ts`
`toContinuationRequest`) queues a run behind any active one and calls `startTurn`:

- `delivery: "message_text"`: `detail` is the whole prompt (`creationSource: "server"`).
- `delivery: "adapter_buffered"` or absent: the pack already buffered the output; the turn
  (`creationSource: "provider"`) only triggers ingestion.
- `notification` is `OrchestrationV2Notification` JSON and labels the timeline row.

## MCP access

| Before                                                                         | After                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PackSessionStartInput.mcp {endpoint, authorizationHeader}` per `startSession` | `PackOpenSessionInput.mcp?: PackMcpAccess` = the access of the thread that **opened** the session; `PackTurnInput.mcp?` (`startTurn`, `compactThread`) and the `steerTurn` input's `mcp?` = the access of **that turn's** thread (absent when the host has none) |

- A pack whose capabilities declare `sessions.supportsMultipleProviderThreadsPerSession: true`
  must re-point its `t3-code` MCP server / header to the per-turn `mcp` for each turn. Otherwise
  tool calls (`delegate_task`, `t3_thread_*`, `t3team_ask_user`) during another thread's turn act
  as the opening thread, and break once that thread detaches and its credential is revoked.
  One-thread-per-session packs may ignore it (same value). Refs `t3team-pack-driverMcp.ts`
  `withPackMcp`.
- Host-issued credentials carry upstream's baseline capabilities (`orchestration`, `worktree`,
  `pull-requests`; `apps/server/src/mcp/McpSessionRegistry.ts`). Every `t3team_*` tool needs
  `orchestration` (3.5); the orchestration author's credential resolves with none.

## Per-job control and background work

- `PackProviderInstance.jobControl(threadId, request)` → optional
  `PackSessionRuntime.jobControl({providerThread, request})`. `POST /api/t3team/thread/jobs`
  reaches it only on a live session: no session → 4xx ("No active provider session for this
  thread; …"); method absent → `{supported: false}` (`apps/server/src/t3team-providerJobControl.ts`,
  `t3team-thread-jobs-route.ts`).
- Implement `hasPendingBackgroundWork()` / `hasPendingBackgroundWorkForThread(providerThread)` when
  the provider runs work outside a turn: while they report `true` the host defers idle release
  (default 30 min) and holds the root run open.

## Failures, retries and the turn watchdog

| Situation                           | Emit                                                                                           | Host behaviour                                                                                                                                                                    |
| ----------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Usage limit                         | failed terminal, `failure.class: "usage_limit"`, `resetAt`                                     | upstream `UsageLimitRecoveryWorker` (settings `autoResumeLimitedThreads`, `snoozeLimitedThreads`)                                                                                 |
| Transient failure                   | failed terminal whose `error` item has `failure.retryable: true` or `class: "transport_error"` | fork retry: system note `Retrying (n/3) — …`, then a manual continuation (below)                                                                                                  |
| Provider-side backoff               | running `turn_item` of type `error` with `retry {attempt, maxAttempts, retryDelayMs}`          | keeps the turn alive; replaces V1 `runtime.warning{code: "provider.retry"}`                                                                                                       |
| Approval or question                | `runtime_request.updated` with `status: "pending"`                                             | the watchdog never fires while it is pending in the projection; the full budget re-arms from the answer                                                                           |
| Long tool call                      | `dynamic_tool` / `command_execution` / `subagent` item `running`, then `completed` / `failed`  | budget stretched to max(budget, 62 min) while open                                                                                                                                |
| No provider event within the budget | —                                                                                              | interrupt with `requestRuntimeRestart: true`; whatever ends the turn, the run fails retryably (`transport_error`, `code: "turn_inactivity"`) and the transient retry continues it |
| User Stop not answered within 30 s  | —                                                                                              | run settles `interrupted` with a `run_interrupt_result`, resumable, never auto-continued                                                                                          |

- Budget: `ProviderInstanceConfig.turnInactivityTimeoutSeconds`
  (`packages/contracts/src/providerInstance.ts`), default 600 s. Refs
  `apps/server/src/orchestration-v2/t3team-turnInactivityWatchdog.ts`, `t3team-turnInactivityWaits.ts`,
  `t3team-turnInactivitySettlement.ts`, `t3team-turnInactivityPolicy.ts`.
- A pack may keep ending an interrupted turn `interrupted`; the host classifies it. Do not key on
  `interrupt_no_terminal` (legacy runs only). Code building `TurnInactivityPolicy` by hand adds
  `isRuntimeRequestPending(threadId, requestId)`.
- Never transient: `usage_limit`, `permission_error`, `validation_error`, `interrupt_no_terminal`.
- One retrier per failed run (`apps/server/src/t3team-threadTransientTurnRetryOwner.ts`): a run with
  a user Stop is never continued; an app-owned delegated child only gets the note "… — not retried
  automatically: the delegating agent was told this run failed" (its parent decides, 3.3); a
  workflow `askAgent` run is left to the workflow's own re-drive; every other run gets
  `message.dispatch{manualContinuationOfRunId, text: "Continue where you left off.", createdBy:
"system", creationSource: "server"}` (`apps/server/src/t3team-threadTransientTurnRetryReactor.ts`).

## OpenCode harness

`PackHostCapabilities.createOpenCodeHarness(options)` returns a `PackProviderInstance` whose
`orchestration` sessions, threads and events already carry the pack's driver kind. Decorate
`orchestration.openSession`, a session's `startTurn` or `events()` instead of `startSession` /
instance `events()`. Harness sessions forward `hasPendingBackgroundWork` and
`hasPendingBackgroundWorkForThread`; a decorator that lists methods explicitly (instead of
spreading the session) must forward both (`apps/server/src/t3team-pack-driverHarness.ts`,
`t3team-pack-driverHarnessSession.ts`).

## Child-target eligibility

`orchestrator_capabilities` marks a provider `canRunChildTask: false` when its snapshot is
disabled, not installed, `status: "error" | "disabled"` or unauthenticated
(`apps/server/src/mcp/OrchestratorMcpService.ts` `providerConstraints`). Keep the pack snapshot
accurate if its models should be delegation targets.

# 3.2 Model and text-generation policy

| Before (env)                                                                | After (`defineModelPolicy`, capability `model-policy:v1`)                                                                               |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `T3TEAM_DEFAULT_MODEL_INSTANCE_ID` + `T3TEAM_DEFAULT_MODEL`                 | `defaultModelSelection: {instanceId, model, options?}`: welcome-thread model and text-generation default while the user has chosen none |
| `T3TEAM_TEXT_GENERATION_MODEL_INSTANCE_ID` + `T3TEAM_TEXT_GENERATION_MODEL` | `textGenerationModelSelection: {…}`: pins every settings-derived generator                                                              |

- One pack per host ("Multiple workspace packs define a model policy"); also honoured from the
  compiled-in distribution's `activateDistribution`. An invalid selection rejects at load as a
  warning, not a boot failure (`apps/server/src/t3team-pack-modelPolicy.ts`,
  `apps/server/src/t3team-configuredDefaultModelSelection.ts`).
- The `textGenerationModelSelection` pin wins over user settings, the user's
  `sourceControlWriterModelSelection` and per-project overrides: commit messages, PR content,
  branch names, thread titles and activity labels all go to it
  (`apps/server/src/textGeneration/t3team-textGenerationModelPin.ts`). Effective settings report
  the pin and `sourceControlWriterModelSelection: null`; stored values are untouched and apply
  again once no pin is registered. A pack that wants project overrides to win registers
  `defaultModelSelection` instead.
- `generateStructured` (child status summaries, workflow repair) is not pinned; it follows
  `defineWorkflowAgentModelPolicy` / `defineWorkflowRepairPolicy` (both unchanged, as is
  `defineWorkflowEphemeralConcurrencyPolicy`).
- Activity labels are generated only when the text-generation driver of the resolved instance
  implements the optional `PackTextGeneration.generateActivityLabel`; the label is the thread fact
  `activityLabel` (`apps/server/src/t3team-activityLabelReactor.ts`).
- The web build-time `VITE_T3TEAM_DEFAULT_MODEL(_INSTANCE_ID)`
  (`apps/web/src/t3team-configuredDefaultModelSelection.ts`) is separate and unchanged.
