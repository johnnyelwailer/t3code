/**
 * Wraps a host `ProviderInstance` (Effect surface) back into a pack
 * `PackProviderInstance` (Promise / AsyncIterable surface). Used only by the
 * `createOpenCodeHarness` capability so a pack can compose and decorate the
 * reviewed host OpenCode harness. This is the inner half of the accepted-for-v1
 * Effect -> Promise -> Effect double bridge.
 *
 * @module t3team-pack-driverHarnessWrap
 */
import {
  RuntimeMode,
  ThreadId,
  type ProviderSendTurnInput,
  type ProviderSessionStartInput,
  type ServerProvider,
} from "@t3tools/contracts";
import type {
  PackProviderInstance,
  PackProviderSession,
  PackProviderSnapshot,
  PackSendTurnInput,
  PackSessionStartInput,
  PackThreadSnapshot,
} from "@t3team/packs";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Stream from "effect/Stream";

import type { ProviderInstance } from "./provider/ProviderDriver.ts";

const serverToPackSnapshot = (snapshot: ServerProvider): PackProviderSnapshot => ({
  displayName: snapshot.displayName ?? snapshot.driver,
  enabled: snapshot.enabled,
  installed: snapshot.installed,
  version: snapshot.version,
  status: snapshot.status,
  authenticated: snapshot.auth.status === "authenticated",
  ...(snapshot.message ? { message: snapshot.message } : {}),
  models: snapshot.models.map((model) => ({
    slug: model.slug,
    name: model.name,
    isCustom: model.isCustom,
  })),
});

const degradedPackSnapshot = (driver: string): PackProviderSnapshot => ({
  displayName: driver,
  enabled: false,
  installed: false,
  version: null,
  status: "error",
  message: "Harness snapshot unavailable",
  models: [],
});

const toStartInput = (input: PackSessionStartInput): ProviderSessionStartInput => ({
  threadId: ThreadId.make(input.threadId),
  runtimeMode: input.runtimeMode as RuntimeMode,
  ...(input.cwd ? { cwd: input.cwd } : {}),
  ...(input.resumeCursor !== undefined ? { resumeCursor: input.resumeCursor } : {}),
  ...(input.modelSelection !== undefined
    ? { modelSelection: input.modelSelection as ProviderSessionStartInput["modelSelection"] }
    : {}),
  ...(input.approvalPolicy !== undefined
    ? { approvalPolicy: input.approvalPolicy as ProviderSessionStartInput["approvalPolicy"] }
    : {}),
  ...(input.sandboxMode !== undefined
    ? { sandboxMode: input.sandboxMode as ProviderSessionStartInput["sandboxMode"] }
    : {}),
});

const toSendTurnInput = (input: PackSendTurnInput): ProviderSendTurnInput => ({
  threadId: ThreadId.make(input.threadId),
  ...(input.input ? { input: input.input } : {}),
  ...(input.attachments !== undefined
    ? { attachments: input.attachments as ProviderSendTurnInput["attachments"] }
    : {}),
  ...(input.modelSelection !== undefined
    ? { modelSelection: input.modelSelection as ProviderSendTurnInput["modelSelection"] }
    : {}),
  ...(input.interactionMode !== undefined
    ? { interactionMode: input.interactionMode as ProviderSendTurnInput["interactionMode"] }
    : {}),
});

export const providerInstanceToPack = (
  instance: ProviderInstance,
  ambient: Context.Context<never>,
): PackProviderInstance => {
  const run = <A, E>(effect: Effect.Effect<A, E>): Promise<A> =>
    Effect.runPromiseWith(ambient)(effect as Effect.Effect<A, E, never>);
  const { adapter } = instance;
  return {
    snapshot: () => {
      // getSnapshot is Ref-backed and synchronous today; runSyncExit guards a
      // future regression (async/services in getSnapshot) from becoming a
      // defect here — degrade to an error snapshot instead.
      const exit = Effect.runSyncExit(instance.snapshot.getSnapshot);
      return Exit.isSuccess(exit)
        ? serverToPackSnapshot(exit.value)
        : degradedPackSnapshot(String(instance.driverKind));
    },
    startSession: (input) =>
      run(adapter.startSession(toStartInput(input))) as Promise<PackProviderSession>,
    sendTurn: (input) => run(adapter.sendTurn(toSendTurnInput(input))),
    interruptTurn: (threadId, turnId) =>
      run(adapter.interruptTurn(ThreadId.make(threadId), turnId as never)),
    respondToRequest: (threadId, requestId, decision) =>
      run(adapter.respondToRequest(ThreadId.make(threadId), requestId as never, decision as never)),
    respondToUserInput: (threadId, requestId, answers) =>
      run(
        adapter.respondToUserInput(ThreadId.make(threadId), requestId as never, answers as never),
      ),
    stopSession: (threadId) => run(adapter.stopSession(ThreadId.make(threadId))),
    hasSession: (threadId) => run(adapter.hasSession(ThreadId.make(threadId))),
    listSessions: () => run(adapter.listSessions()) as Promise<readonly PackProviderSession[]>,
    readThread: (threadId) =>
      run(adapter.readThread(ThreadId.make(threadId))) as unknown as Promise<PackThreadSnapshot>,
    rollbackThread: (threadId, numTurns) =>
      run(
        adapter.rollbackThread(ThreadId.make(threadId), numTurns),
      ) as unknown as Promise<PackThreadSnapshot>,
    stopAll: () => run(adapter.stopAll()),
    events: () => Stream.toAsyncIterableWith(adapter.streamEvents, ambient),
    dispose: () => Promise.resolve(),
  };
};
