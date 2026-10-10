import { assert, it } from "@effect/vitest";
import {
  CommandId,
  EventId,
  MessageId,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  ProviderTurnId,
  ThreadId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as SqlitePersistence from "../persistence/Sqlite.ts";
import { CodexProviderCapabilitiesV2 } from "./Adapters/CodexAdapterV2.ts";
import * as Orchestrator from "./Orchestrator.ts";
import * as ProjectionStore from "./ProjectionStore.ts";
import type { ProviderAdapterV2Shape } from "./ProviderAdapter.ts";
import * as ProviderAdapterRegistry from "./ProviderAdapterRegistry.ts";
import * as ProviderReplayHarness from "./testkit/ProviderReplayHarness.ts";
import { EventSinkWriteError } from "./EventSink.ts";

const instanceId = ProviderInstanceId.make("codex");
const modelSelection = { instanceId, model: "gpt-5.1-codex" };
const adapter = {
  instanceId,
  driver: ProviderDriverKind.make("codex"),
  getCapabilities: () => Effect.succeed(CodexProviderCapabilitiesV2),
  planSelectionTransition: () => Effect.succeed({ type: "apply_on_next_turn" as const }),
  openSession: () => Effect.die("Runs here never reach a provider"),
} as ProviderAdapterV2Shape;
const layerDatabase = SqlitePersistence.layerMemory;
const layerTest = Layer.mergeAll(
  layerDatabase,
  ProjectionStore.layer.pipe(Layer.provide(layerDatabase)),
  ProviderReplayHarness.layerWithRegistry(
    { name: "dead-session-send" },
    ProviderAdapterRegistry.layerFromAdapters([adapter]),
    { databaseLayer: layerDatabase, runEffectWorker: false },
  ),
);

const createThread = (threadId: ThreadId) =>
  Effect.gen(function* () {
    const orchestrator = yield* Orchestrator.OrchestratorV2;
    yield* orchestrator.dispatch({
      type: "thread.create",
      commandId: CommandId.make(`create:${threadId}`),
      threadId,
      projectId: ProjectId.make("project:dead-session-send"),
      title: threadId,
      modelSelection,
      runtimeMode: "full-access",
      interactionMode: "default",
      branch: null,
      worktreePath: null,
      createdBy: "user",
      creationSource: "web",
    });
  });

/**
 * Project a zombie "running" turn whose live provider session is gone — the
 * idle-timeout / crash shape that used to dead-end Send with
 * "Provider session … is not active."
 */
const seedZombieRunningTurn = (threadId: ThreadId) =>
  Effect.gen(function* () {
    const orchestrator = yield* Orchestrator.OrchestratorV2;
    const projections = yield* ProjectionStore.ProjectionStoreV2;
    yield* orchestrator.dispatch({
      type: "message.dispatch",
      commandId: CommandId.make(`seed:${threadId}`),
      threadId,
      messageId: MessageId.make(`message:${threadId}:seed`),
      text: "seed",
      attachments: [],
      dispatchMode: { type: "start_immediately" },
      createdBy: "user",
      creationSource: "web",
    });
    const now = yield* DateTime.now;
    const projection = yield* orchestrator.getThreadProjection(threadId);
    const run = projection.runs[0]!;
    const attempt = projection.attempts.find((candidate) => candidate.id === run.activeAttemptId)!;
    yield* projections.apply({
      id: EventId.make(`event:${threadId}:run-running`),
      type: "run.updated",
      threadId,
      runId: run.id,
      occurredAt: now,
      payload: { ...run, status: "running", startedAt: now },
    });
    yield* projections.apply({
      id: EventId.make(`event:${threadId}:attempt-running`),
      type: "run-attempt.updated",
      threadId,
      runId: run.id,
      occurredAt: now,
      payload: { ...attempt, status: "running", startedAt: now },
    });
    yield* projections.apply({
      id: EventId.make(`event:${threadId}:turn-running`),
      type: "provider-turn.updated",
      threadId,
      occurredAt: now,
      payload: {
        id: ProviderTurnId.make(`provider-turn:${threadId}:zombie`),
        providerThreadId: run.providerThreadId!,
        nodeId: run.rootNodeId!,
        runAttemptId: run.activeAttemptId!,
        nativeTurnRef: null,
        ordinal: 1,
        status: "running",
        startedAt: now,
        completedAt: null,
      },
    });
    return run;
  });

it.effect(
  "send after a timed-out/idle-released session settles the zombie turn and starts a fresh run",
  () =>
    Effect.gen(function* () {
      const orchestrator = yield* Orchestrator.OrchestratorV2;
      const threadId = ThreadId.make("thread:dead-session-send");
      yield* createThread(threadId);
      const zombie = yield* seedZombieRunningTurn(threadId);

      // Steer into the projected running turn with no live session — previously
      // failed with "Provider session … is not active."
      yield* orchestrator.dispatch({
        type: "message.dispatch",
        commandId: CommandId.make(`send:${threadId}:recover`),
        threadId,
        messageId: MessageId.make(`message:${threadId}:recover`),
        text: "continue after timeout",
        attachments: [],
        dispatchMode: { type: "steer_active", targetRunId: zombie.id },
        createdBy: "user",
        creationSource: "web",
      });

      const after = yield* orchestrator.getThreadProjection(threadId);
      const zombieAfter = after.runs.find((run) => run.id === zombie.id);
      assert.equal(zombieAfter?.status, "interrupted");
      const fresh = after.runs.find((run) => run.userMessageId === `message:${threadId}:recover`);
      assert.isDefined(fresh);
      assert.isTrue(
        fresh!.status === "preparing" ||
          fresh!.status === "starting" ||
          fresh!.status === "queued" ||
          fresh!.status === "running",
      );
      assert.notEqual(fresh!.id, zombie.id);
    }).pipe(Effect.provide(layerTest)),
);

it("EventSinkWriteError message names disk pressure for SQLITE_CANTOPEN", () => {
  const error = new EventSinkWriteError({
    eventCount: 3,
    cause: "unable to open database file",
  });
  assert.match(error.message, /disk may be full/i);
  assert.isFalse(/unable to open database file/i.test(error.message));
});
