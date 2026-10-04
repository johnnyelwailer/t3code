# Pack migration guide: orchestration V2

For an agent migrating a private pack (provider drivers, including a local-model provider whose
orchestrator model relies on child-thread updates, plus recipes, prompts and distribution
policies) from the pre-V2 fork (`bd50b08a`) to this tree (upstream merge `88992deee` plus the
fork port on `sync/upstream-20261003`). Every path named in this guide exists in this tree unless
it is marked _removed_. No compatibility aliases or V1 shims were kept for pack-facing surfaces.
The guide is split into one page per concern under
[`t3team-pack-migration-orchestration-v2/`](t3team-pack-migration-orchestration-v2/).

## 1. What changed and why

- Upstream replaced orchestration V1 (commands, events, activities, read model, `ProviderService`,
  V1 provider adapters) with **orchestration V2**: app threads, runs, execution nodes, subagents
  and typed turn items (`packages/contracts/src/orchestrationV2.ts`), driven through provider
  adapters shaped as `ProviderAdapterV2Shape` (`apps/server/src/orchestration-v2/ProviderAdapter.ts`).
  V1 is deleted, not deprecated: `thread.activity.append`, `thread.message.upsert`,
  `thread.actor.message`, `thread.turn.resume` and the V1 `OrchestrationThread` /
  `OrchestrationEvent` types are gone. Packs read and write V2 shapes only.
- The client/server orchestration protocol is **2** (`ORCHESTRATION_PROTOCOL_VERSION`,
  `packages/contracts/src/environment.ts`). `/ws` without `?orchestrationProtocol=2` answers
  HTTP 426 `{code: "orchestration_protocol_incompatible"}` (`apps/server/src/ws.ts`).
- Where upstream now ships a feature the fork also had, the fork copy was deleted: thread fork,
  child wait and notify, queued messages, usage-limit holds, restart wake, background liveness,
  local provider-session import. Fork-only features were rebuilt on V2 primitives: thread facts
  and artifacts side streams, a durable inter-agent mailbox, settle guards, the workflow host.
- Background reading: `docs/orchestration-v2/README.md`, `core-graph-and-data-model.md`,
  `provider-capability-system.md`, `orchestrator-mcp-server.md` (same folder).

### What a pack can reach

| Surface                                                                                                                                                                                                    | How a pack uses it                                                                                                  | Pages         |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------- |
| `PackActivationContext` (`packages/t3team-pack-api/src/index.ts`)                                                                                                                                          | `activate(context)` of a runtime pack (`T3TEAM_PACKS_DIR`) or the compiled-in distribution (`activateDistribution`) | 3.1, 3.2, 3.3 |
| MCP tools of the `t3-code` server                                                                                                                                                                          | agent prompts, AGENTS.md text, recipes                                                                              | 3.3, 3.4, 3.5 |
| Broker tool ids, recipe tool groups, `@t3team/sdk`                                                                                                                                                         | recipe tool contexts, workflow bodies                                                                               | 3.5, 3.9      |
| Environment variables, settings                                                                                                                                                                            | distribution environment                                                                                            | 3.10          |
| `@t3tools/contracts`, `@t3tools/shared`, `@t3tools/client-runtime`, `/api/t3team/*`                                                                                                                        | compiled-in distribution code, pack clients and tooling                                                             | 3.11, 3.12    |
| Host Effect services (`T3TeamThreadFactsStore`, `T3TeamThreadArtifactsStore`, `T3TeamThreadMessageRecorder`, `T3TeamThreadLineage`, `T3TeamSettleGuard`, `DelegatedTaskPreparation`, `T3TeamActorMailbox`) | **not** on `PackActivationContext`; reachable only from server code wired in `apps/server/src/server.ts`            | 3.6, 3.7, 3.8 |

## 2. Migration checklist (in dependency order)

1. **Imports.** Import the driver contract from `@t3team/pack-api` only; `@t3team/packs` no
   longer re-exports driver types ([3.1](t3team-pack-migration-orchestration-v2/t3team-provider-spi.md)).
2. **Manifest.** Keep `provider-driver:<driver>` per executable driver. Add `model-policy:v1` for
   `defineModelPolicy` and `completion-wake-renderer:v1` for `defineCompletionWakeRenderer`.
3. **Environment.** Delete the removed env vars and settings
   ([3.10](t3team-pack-migration-orchestration-v2/t3team-workflows-and-contracts.md)); register the
   model selections with `defineModelPolicy`
   ([3.2](t3team-pack-migration-orchestration-v2/t3team-provider-runtime.md)).
4. **Provider driver.** Rewrite every executable driver to `schemaVersion: 2`: an orchestration V2
   adapter whose sessions emit V2 adapter events and end every turn with exactly one
   `turn.terminal` ([3.1](t3team-pack-migration-orchestration-v2/t3team-provider-spi.md)).
5. **Turn provenance.** Run every `startTurn`, whatever `message.createdBy` / `creationSource`
   say; child-update wakes and agent messages arrive this way (3.1).
6. **MCP per turn.** A session that serves several app threads uses each turn's `mcp` access;
   wakes use `host.requestContinuation`; job control moves onto the session (3.1 runtime page).
7. **Failures.** Report usage limits, retryable failures, backoffs and runtime requests in V2
   shapes; settle tool items so long waits are honoured by the turn watchdog (3.1 runtime page).
8. **Orchestrator model.** Register a completion-wake renderer if the orchestrating model needs
   each child's status and result inline; drop child report-back instructions; retry failed
   children from the failure wake
   ([3.3](t3team-pack-migration-orchestration-v2/t3team-child-threads.md)).
9. **Prompts, AGENTS.md text, recipes.** Apply the tool renames and removals
   ([3.4, 3.5](t3team-pack-migration-orchestration-v2/t3team-messaging-and-tools.md)).
10. **Host-side pack code** (compiled-in distribution only): write facts/artifacts, run-less
    messages, lineage and settle guards through the host services
    ([3.6–3.8](t3team-pack-migration-orchestration-v2/t3team-host-services.md)).
11. **Workflow bodies and recipe gates.** Drop `tools.t3team.thread.rename`; switch harness
    assertions from `commandTypes` to `hostOperations`
    ([3.9](t3team-pack-migration-orchestration-v2/t3team-workflows-and-contracts.md)).
12. **Clients and tooling** (if the pack ships any): protocol 2, moved symbols, side streams,
    authenticated `/api/t3team/*` routes
    ([3.11](t3team-pack-migration-orchestration-v2/t3team-workflows-and-contracts.md),
    [3.12](t3team-pack-migration-orchestration-v2/t3team-clients-and-data.md)).
13. **Move distribution code** out of this public tree into the pack
    ([4](t3team-pack-migration-orchestration-v2/t3team-distribution-code.md)).
14. **Verify.** Model driver tests on `apps/server/src/t3team-pack-driver.fixtures.ts` and
    `apps/server/src/t3team-pack-driverOrchestrator.integration.test.ts`; run recipes through
    `apps/server/src/t3team-recipeWorkflowE2e.ts`.

## 3. Sections by concern

| §        | Concern                                                                           | Page                                                                                                          |
| -------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 3.1      | Provider SPI: types before → after, lifecycle, events, provenance, skeleton       | [t3team-provider-spi.md](t3team-pack-migration-orchestration-v2/t3team-provider-spi.md)                       |
| 3.1      | Provider SPI runtime: wakes, MCP, jobs, failures and watchdog, OpenCode harness   | [t3team-provider-runtime.md](t3team-pack-migration-orchestration-v2/t3team-provider-runtime.md)               |
| 3.2      | Model and text-generation policy                                                  | [t3team-provider-runtime.md](t3team-pack-migration-orchestration-v2/t3team-provider-runtime.md)               |
| 3.3      | Child threads: `delegate_task`, status/cancel, relations, completion wakes        | [t3team-child-threads.md](t3team-pack-migration-orchestration-v2/t3team-child-threads.md)                     |
| 3.4–3.5  | Agent messaging (`t3_thread_send` mailbox), MCP tool renames and removals         | [t3team-messaging-and-tools.md](t3team-pack-migration-orchestration-v2/t3team-messaging-and-tools.md)         |
| 3.6–3.8  | Thread facts and artifacts, run-less messages and lineage writers, settle guards  | [t3team-host-services.md](t3team-pack-migration-orchestration-v2/t3team-host-services.md)                     |
| 3.9–3.11 | Workflows, recipes and SDK; removed settings and env vars; RPC and contract moves | [t3team-workflows-and-contracts.md](t3team-pack-migration-orchestration-v2/t3team-workflows-and-contracts.md) |
| 3.12     | Client expectations; data carried over at first start                             | [t3team-clients-and-data.md](t3team-pack-migration-orchestration-v2/t3team-clients-and-data.md)               |
| 4        | Distribution-specific code still in the fork                                      | [t3team-distribution-code.md](t3team-pack-migration-orchestration-v2/t3team-distribution-code.md)             |

### Stale text still in this tree

Do not migrate from these; they predate the port.

| Location                                                                                                       | States                                                                                     | Current behaviour                                                                                                       |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `docs/t3team-mvp/38-executable-workspace-packs.md` (executable provider drivers)                               | `schemaVersion: 1`, `startSession` / `sendTurn` / `events()`, harness wraps `startSession` | 3.1                                                                                                                     |
| `packages/contracts/src/t3team-orchestrationExt.ts` (`ThreadEnvironmentBinding` doc)                           | binding set through `t3team.thread.start_child`; "send_message / mailbox / children ops"   | `delegate_task` `extensions.environment`; `t3_thread_send` mode `mailbox`                                               |
| `packages/contracts/src/provider.ts` `ProviderSendTurnInput.turnOrigin`                                        | advisory turn origin                                                                       | nothing sets it; use `PackTurnMessage.createdBy` / `creationSource`                                                     |
| `apps/server/src/t3team-projectSetupAgentsPreviousStartChild.ts`, `t3team-projectSetupAgentsManagedRefresh.ts` | `t3team.thread.start_child`                                                                | previous AGENTS.md texts kept only for managed-section matching; the current text is in `t3team-projectSetupContent.ts` |
