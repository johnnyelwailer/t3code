# 3.1 Provider SPI: contract, lifecycle, events

Part of the [pack migration guide](../t3team-pack-migration-orchestration-v2.md). Wakes, MCP
access, job control, failures and model policy are on the
[provider runtime page](t3team-provider-runtime.md).

Contract: `packages/t3team-pack-api/src/provider-driver.ts`,
`packages/t3team-pack-api/src/provider-orchestration.ts`. Host mapping (all in
`apps/server/src/`): `t3team-pack-driverBridge.ts`, `t3team-pack-driverAdapter.ts`,
`t3team-pack-driverSession.ts`, `t3team-pack-driverSessionThreads.ts`,
`t3team-pack-driverSessionProbes.ts`, `t3team-pack-driverEvents.ts`, `t3team-pack-driverCodec.ts`
(`PackCodec`), `t3team-pack-driverDefinition.ts`.

## Before → after

| Before (schemaVersion 1)                                                                                                                                                                                                                | After (schemaVersion 2)                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schemaVersion: 1`                                                                                                                                                                                                                      | `schemaVersion: 2`; `defineProviderDriver` throws otherwise and the host rejects a v1 driver at activation (`… uses schemaVersion 1; this host requires schemaVersion 2 (orchestration V2 adapter)`). No V1 shim, no event translation.                                                                                                                                                                                |
| `PackProviderInstance.{startSession, sendTurn, interruptTurn(threadId, turnId?), respondToRequest, respondToUserInput, stopSession, hasSession, listSessions, readThread, rollbackThread(threadId, n), jobControl?, stopAll, events()}` | `PackProviderInstance.{snapshot, subscribeSnapshot?, orchestration, textGeneration?, dispose}`                                                                                                                                                                                                                                                                                                                         |
| —                                                                                                                                                                                                                                       | `orchestration: PackOrchestrationAdapter {getCapabilities, planSelectionTransition?, openSession}`, mirroring host `ProviderAdapterV2Shape`                                                                                                                                                                                                                                                                            |
| —                                                                                                                                                                                                                                       | `openSession` returns `PackSessionRuntime {providerSession, events, ensureThread, resumeThread, startTurn, interruptTurn, respondToRuntimeRequest, readThreadSnapshot, close}` plus optional `injectHistory`, `compactThread`, `steerTurn`, `unloadThread`, `rollbackThread`, `forkThread`, `jobControl`, `hasPendingBackgroundWork`, `hasPendingBackgroundWorkForThread`, mirroring `ProviderAdapterV2SessionRuntime` |
| `PackSessionStartInput`, `PackSendTurnInput`, `PackTurnStartResult`, `PackProviderSession`                                                                                                                                              | `PackOpenSessionInput`, `PackTurnInput` (+ `PackTurnMessage`), `void`, the `providerSession` JSON                                                                                                                                                                                                                                                                                                                      |
| `PackResumeCursor` (opaque)                                                                                                                                                                                                             | _removed_: keep resume state in the provider thread/session JSON (`nativeThreadRef`, `providerPayload`); the host hands it back on `resumeThread` / `resumeFromSession`                                                                                                                                                                                                                                                |
| `PackSendTurnInput.turnOrigin: "user" \| "automated"`                                                                                                                                                                                   | `PackTurnMessage.{createdBy, creationSource, senderThreadId?, scheduledTaskId?}`                                                                                                                                                                                                                                                                                                                                       |
| instance `events()` yielding V1 `ProviderRuntimeEvent` (`turn.started`, `content.delta`, `item.*`, `request.opened`, `turn.completed`, `runtime.warning`, `session.exited`)                                                             | per-session `events()` yielding `ProviderAdapterV2Event` JSON                                                                                                                                                                                                                                                                                                                                                          |
| opaque host values forwarded verbatim (`modelSelection`, `interactionMode`, attachments)                                                                                                                                                | canonical JSON (`Schema.toCodecJson` of the named `@t3tools/contracts` schema: ISO timestamps, plain-string ids). The host decodes every return value and event and fails the call with the matching `ProviderAdapter*Error` when it does not decode.                                                                                                                                                                  |
| driver types re-exported from `@t3team/packs`                                                                                                                                                                                           | _removed_ (`t3team-packs.providerDriver.ts`); the loader's `PackActivationContext.defineProviderDriver` takes `PackProviderDriverRegistration {schemaVersion, driver, displayName}`                                                                                                                                                                                                                                    |

Unchanged: `PackTextGeneration`, `PackProviderSnapshot`, `PackJobControlRequest`,
`PackJobControlResult`, `PackDriverCreateInput`, the `provider-driver:<driver>` capability, and the
data-only `defineAgentProvider` (`schemaVersion: 1`, `ai-provider:<driver>`).

## Lifecycle

- The host calls `openSession` once per host provider session, owns residency and idle release,
  and calls `close()` once. `close()` must also be safe on a session that never received
  `ensureThread` / `startTurn`: when the host interrupts a pending `openSession` (Stop while
  starting, shutdown), it closes the late session as soon as it resolves (bounded 5 s). The host
  does not abort a pending `openSession`, so keep it bounded.
- One provider thread per app thread: `ensureThread` creates it, `resumeThread` reattaches it.
- `startTurn` once per run; resolve once the turn is accepted. Progress and the terminal arrive
  through `events()`. No lazy session start inside a turn call.
- Interrupts and answers are keyed by `providerTurnId` / `requestId`, never by thread id.
- Optional methods mean "unsupported": steering falls back to interrupt-and-restart when the
  capabilities allow it; rollback and fork fail so the host uses portable context transfer.
- `PackTurnInput.appThread` is the `OrchestrationV2AppThread` JSON; a child session can read
  `appThread.lineage.{parentThreadId, relationshipToParent, rootThreadId}`.
  `restartContinuationOfRunId` is set when upstream `RestartContinuation` re-runs a run a server
  restart interrupted.

## Events

Each session's `events()` is single-consumer and yields `ProviderAdapterV2Event` JSON:
`app_thread.created`, `provider_session.updated`, `provider_thread.updated`,
`provider_turn.updated`, `node.updated`, `subagent.updated`, `message.updated`,
`turn_item.updated`, `runtime_request.updated`, `plan.updated`, `turn.terminal`.

- The host re-stamps `driver`. An undecodable event is dropped and logged; an undecodable
  `turn.terminal` (or a throwing iterable) fails the session and the run settles `failed`.
- End every turn with exactly one `turn.terminal {providerThreadId, providerTurnId, runOrdinal,
status, failure, threadDisposition}`. `status: "failed"` also needs `failureItemOrdinal` and an
  `OrchestrationV2ProviderFailure {class, message, code, retryable, resetAt?}`.
- Put the turn's answer in its last assistant message: a delegated task's result is the child's
  last assistant message, and a workflow `askAgent` step reads the run's last substantive one.
- Emit typed turn items with accurate `status` / `streaming`; clients derive the activity word
  from them (3.12).
- Field lists: `OrchestrationV2ProviderTurn`, `OrchestrationV2ConversationMessage`,
  `OrchestrationV2TurnItem` in `packages/contracts/src/orchestrationV2.ts`. Reference emitters:
  `apps/server/src/orchestration-v2/Adapters/PiAdapterV2.ts`, `OpenCodeAdapterV2.ts`.

## Turn provenance

Every automated input arrives as an ordinary `startTurn`. Never drop a non-user turn.

| Input                                                        | `createdBy` | `creationSource` | Notes                                               |
| ------------------------------------------------------------ | ----------- | ---------------- | --------------------------------------------------- |
| Typed user message                                           | `user`      | `web` / `mobile` |                                                     |
| Delegated-completion wake (3.3)                              | `agent`     | `server`         | text = default or rendered wake                     |
| `requestContinuation`, `delivery: "message_text"`            | `agent`     | `server`         | text = `detail`                                     |
| `requestContinuation`, `adapter_buffered` or no `delivery`   | `agent`     | `provider`       | pack ingests its own buffer                         |
| `t3_thread_send` mode `auto` / `queue` / `steer` / `restart` | `agent`     | `mcp`            | `senderThreadId` set                                |
| Inter-agent mailbox digest (3.4)                             | `agent`     | `server`         | `senderThreadId` = first sender, `notification` set |
| Workflow step prompt (3.9)                                   | `system`    | `server`         | author in the message context                       |
| Transient retry                                              | `system`    | `server`         | `Continue where you left off.`                      |
| Restart continuation                                         | `agent`     | `server`         | `restartContinuationOfRunId` set                    |
| Usage-limit resume                                           | `user`      | `server`         | `Continue where you left off.`                      |

`PackTurnMessage` has no delegated-completion flag: a wake and a `message_text` continuation look
alike. A pack that must recognise its wakes can mark them in its own renderer text (3.3).

## Skeleton

A complete minimal driver that the host integration test runs: `makeScriptedPack`,
`providerThreadJson` and `completedTurnEvents` in `apps/server/src/t3team-pack-driver.fixtures.ts`.

```ts
import {
  defineProviderDriver,
  type PackActivationContext,
  type PackJson,
  type PackOpenSessionInput,
  type PackSessionRuntime,
} from "@t3team/pack-api";

const DRIVER = "localmodel"; // manifest capability "provider-driver:localmodel"
const CAPABILITIES: PackJson = {}; // OrchestrationV2ProviderCapabilities JSON (fixtures: CAPABILITIES_JSON)

const localModel = defineProviderDriver({
  schemaVersion: 2,
  driver: DRIVER,
  displayName: "Local model",
  create: async ({ config, environment, host }) => ({
    snapshot: () => ({
      displayName: "Local model",
      enabled: true,
      installed: true,
      status: "ready",
      models: [
        { slug: "orchestrator", name: "Orchestrator" },
        { slug: "worker", name: "Worker" },
      ],
    }),
    orchestration: {
      getCapabilities: async () => CAPABILITIES,
      openSession: async (input) => open(input),
    },
    dispose: async () => {},
  }),
});

function open(input: PackOpenSessionInput): PackSessionRuntime {
  const events = makeQueue(); // single-consumer AsyncIterable<unknown>
  return {
    providerSession: {
      status: "ready",
      cwd: input.runtimePolicy.cwd,
      model: null,
      capabilities: CAPABILITIES,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      lastError: null,
    },
    events: () => events.iterable,
    // OrchestrationV2ProviderThread JSON; keep resume state in nativeThreadRef / providerPayload.
    ensureThread: async ({ threadId }) => providerThreadJson(threadId, input.providerSessionId),
    resumeThread: async ({ providerThread }) => providerThread,
    startTurn: async (turn) => {
      // Use turn.mcp (this turn's thread) for tool calls, not input.mcp. Then stream:
      // provider_turn.updated(running) → message.updated / turn_item.updated →
      // provider_turn.updated(completed) → exactly one turn.terminal.
      void runTurn(turn, events);
    },
    interruptTurn: async ({ providerTurnId }) => abortTurn(providerTurnId, events),
    respondToRuntimeRequest: async ({ requestId, decision, answers }) =>
      answerRequest(requestId, decision, answers),
    readThreadSnapshot: async ({ providerThread }) => ({
      providerThread,
      providerTurns: [],
      messages: [],
      runtimeRequests: [],
    }),
    close: async () => events.end(), // also safe before any ensureThread / startTurn
  };
}

export default async (context: PackActivationContext) => {
  context.defineProviderDriver(localModel);
};
```
