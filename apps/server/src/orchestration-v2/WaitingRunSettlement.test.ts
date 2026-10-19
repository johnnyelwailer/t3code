import { assert, it } from "@effect/vitest";
import {
  CheckpointId,
  CheckpointRef,
  CheckpointScopeId,
  CommandId,
  EventId,
  MessageId,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  type RunId,
  ThreadId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";

import * as SqlitePersistence from "../persistence/Sqlite.ts";
import { CodexProviderCapabilitiesV2 } from "./Adapters/CodexAdapterV2.ts";
import * as CheckpointCaptureService from "./CheckpointCaptureService.ts";
import * as CheckpointService from "./CheckpointService.ts";
import * as EventSink from "./EventSink.ts";
import * as IdAllocator from "./IdAllocator.ts";
import * as Orchestrator from "./Orchestrator.ts";
import * as ProjectionStore from "./ProjectionStore.ts";
import type { ProviderAdapterV2Shape } from "./ProviderAdapter.ts";
import * as ProviderAdapterRegistry from "./ProviderAdapterRegistry.ts";
import * as RunFinalizationService from "./RunFinalizationService.ts";
import * as ProviderReplayHarness from "./testkit/ProviderReplayHarness.ts";

// A run is "waiting" once its provider turn finished and its checkpoint is saving.
// These tests park a run there, then drive Stop, a queued send, and the capture.

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

const checkpointFor = (
  input: Parameters<CheckpointService.CheckpointServiceV2["Service"]["capture"]>[0],
) => ({
  id: CheckpointId.make(`checkpoint:${input.scope.id}:${input.ordinalWithinScope}`),
  threadId: input.scope.threadId,
  scopeId: input.scope.id,
  runId: input.runId,
  nodeId: input.nodeId,
  parentCheckpointId: null,
  ordinalWithinScope: input.ordinalWithinScope,
  appRunOrdinal: input.appRunOrdinal,
  ref: CheckpointRef.make(`ref:${input.scope.id}:${input.ordinalWithinScope}`),
  status: "ready" as const,
  files: [],
  capturedAt: input.capturedAt,
});

/** Snapshots of this workspace fail, as when git cannot write its checkpoint ref. */
const unsnapshottableCwd = "/repo-without-snapshots";

const checkpoints = Layer.mock(CheckpointService.CheckpointServiceV2)({
  materializeBaselineCheckpoint: ({ scope, ordinalWithinScope }) =>
    scope.cwd === unsnapshottableCwd
      ? Effect.fail(
          new CheckpointService.CheckpointBaselineCaptureError({
            scopeId: scope.id,
            ordinalWithinScope,
            cause: "git snapshot failed",
          }),
        )
      : DateTime.now.pipe(
          Effect.map((capturedAt) =>
            checkpointFor({
              scope,
              runId: null,
              nodeId: scope.nodeId,
              ordinalWithinScope,
              appRunOrdinal: null,
              capturedAt,
            }),
          ),
        ),
  capture: (input) =>
    input.scope.cwd === unsnapshottableCwd
      ? Effect.fail(
          new CheckpointService.CheckpointCaptureError({
            scopeId: input.scope.id,
            cause: "git snapshot failed",
          }),
        )
      : Effect.succeed(checkpointFor(input)),
});

// No effect worker: each test drives the run's checkpoint capture itself. The harness
// builds its own capture over real git; fresh layers keep these on the mock above.
const layerTest = Layer.fresh(RunFinalizationService.layer).pipe(
  Layer.provideMerge(
    Layer.fresh(CheckpointCaptureService.layer).pipe(
      Layer.provide(Layer.mergeAll(checkpoints, IdAllocator.layer)),
    ),
  ),
  Layer.provideMerge(
    Layer.mergeAll(
      layerDatabase,
      ProjectionStore.layer.pipe(Layer.provide(layerDatabase)),
      ProviderReplayHarness.layerWithRegistry(
        { name: "waiting-run-settlement" },
        ProviderAdapterRegistry.layerFromAdapters([adapter]),
        { databaseLayer: layerDatabase, runEffectWorker: false },
      ),
    ),
  ),
);

const createThread = (threadId: ThreadId) =>
  Effect.gen(function* () {
    const orchestrator = yield* Orchestrator.OrchestratorV2;
    yield* orchestrator.dispatch({
      type: "thread.create",
      commandId: CommandId.make(`create:${threadId}`),
      threadId,
      projectId: ProjectId.make("project:waiting-run"),
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

const send = (threadId: ThreadId, text: string, type: "start_immediately" | "queue_after_active") =>
  Effect.gen(function* () {
    const orchestrator = yield* Orchestrator.OrchestratorV2;
    yield* orchestrator.dispatch({
      type: "message.dispatch",
      commandId: CommandId.make(`send:${threadId}:${text}`),
      threadId,
      messageId: MessageId.make(`message:${threadId}:${text}`),
      text,
      attachments: [],
      dispatchMode: { type },
      createdBy: "user",
      creationSource: "web",
    });
  });

/** Finishes the thread's first run's provider turn, leaving it waiting on its checkpoint. */
const finishTurn = (threadId: ThreadId, cwd = "/repo") =>
  Effect.gen(function* () {
    const orchestrator = yield* Orchestrator.OrchestratorV2;
    const projections = yield* ProjectionStore.ProjectionStoreV2;
    const projection = yield* orchestrator.getThreadProjection(threadId);
    const run = projection.runs[0]!;
    const rootNode = projection.nodes.find((node) => node.id === run.rootNodeId)!;
    const scopeId = CheckpointScopeId.make(`scope:${run.id}`);
    const now = yield* DateTime.now;
    yield* projections.apply({
      id: EventId.make(`event:${run.id}:scope`),
      type: "checkpoint-scope.created",
      threadId,
      runId: run.id,
      nodeId: rootNode.id,
      occurredAt: now,
      payload: {
        id: scopeId,
        threadId,
        runId: run.id,
        nodeId: rootNode.id,
        parentScopeId: null,
        providerThreadId: run.providerThreadId,
        kind: "root_run",
        ordinalWithinParent: 0,
        advancesAppRunCount: true,
        cwd,
        createdAt: now,
      },
    });
    yield* projections.apply({
      id: EventId.make(`event:${run.id}:node-waiting`),
      type: "node.updated",
      threadId,
      runId: run.id,
      nodeId: rootNode.id,
      occurredAt: now,
      payload: { ...rootNode, status: "waiting", checkpointScopeId: scopeId },
    });
    yield* projections.apply({
      id: EventId.make(`event:${run.id}:run-waiting`),
      type: "run.updated",
      threadId,
      runId: run.id,
      occurredAt: now,
      payload: { ...run, status: "waiting", startedAt: now },
    });
    return { runId: run.id, scopeId };
  });

const runStatuses = (threadId: ThreadId) =>
  Effect.gen(function* () {
    const orchestrator = yield* Orchestrator.OrchestratorV2;
    const projection = yield* orchestrator.getThreadProjection(threadId);
    return projection.runs.map((run) => `${run.status}${run.queueHeld === true ? ":held" : ""}`);
  });

/** Runs `settle`, then waits for the thread's queued run to leave the queue. */
const settleAndAwaitQueueStart = <E, R>(threadId: ThreadId, settle: Effect.Effect<void, E, R>) =>
  Effect.gen(function* () {
    const eventSink = yield* EventSink.EventSinkV2;
    const orchestrator = yield* Orchestrator.OrchestratorV2;
    const queuedRunId = (yield* orchestrator.getThreadProjection(threadId)).runs.at(-1)!.id;
    const afterSequence = yield* eventSink.latestSequence();
    yield* settle;
    yield* eventSink.stream({ threadId, afterSequence, eventType: "run.updated" }).pipe(
      Stream.filter(
        (stored) =>
          stored.event.type === "run.updated" &&
          stored.event.payload.id === queuedRunId &&
          stored.event.payload.status !== "queued",
      ),
      Stream.runHead,
    );
  });

const finalize = (
  threadId: ThreadId,
  target: { readonly runId: RunId; readonly scopeId: CheckpointScopeId },
  willRetry: boolean,
) =>
  Effect.gen(function* () {
    const finalization = yield* RunFinalizationService.RunFinalizationService;
    return yield* Effect.exit(finalization.finalize({ threadId, ...target, willRetry }));
  });

it.effect.each([true, false])(
  "Stop on a run waiting for its checkpoint succeeds, holdQueue=%s",
  (holdQueue) =>
    Effect.gen(function* () {
      const orchestrator = yield* Orchestrator.OrchestratorV2;
      const threadId = ThreadId.make(`thread:waiting-stop:${holdQueue}`);
      yield* createThread(threadId);
      yield* send(threadId, "work", "start_immediately");
      const { runId } = yield* finishTurn(threadId);
      yield* send(threadId, "next", "queue_after_active");

      // A second Stop click finds the run already reached and has nothing to add.
      for (const click of [1, 2]) {
        yield* orchestrator.dispatch({
          type: "run.interrupt",
          commandId: CommandId.make(`stop:${threadId}:${click}`),
          threadId,
          runId,
          holdQueue,
        });
      }

      // The capture still settles the run; a full Stop holds what was queued behind it.
      assert.deepEqual(yield* runStatuses(threadId), [
        "waiting",
        holdQueue ? "queued:held" : "queued",
      ]);
      const stopMarkers = (yield* orchestrator.getThreadProjection(threadId)).turnItems.filter(
        (item) => item.type === "run_interrupt_request",
      );
      assert.lengthOf(stopMarkers, 1);
    }).pipe(Effect.provide(layerTest)),
);

it.effect("a message sent while a run waits queues, then starts when the checkpoint commits", () =>
  Effect.gen(function* () {
    const threadId = ThreadId.make("thread:waiting-queue");
    yield* createThread(threadId);
    yield* send(threadId, "work", "start_immediately");
    const target = yield* finishTurn(threadId);
    yield* send(threadId, "next", "queue_after_active");
    assert.deepEqual(yield* runStatuses(threadId), ["waiting", "queued"]);

    yield* settleAndAwaitQueueStart(threadId, finalize(threadId, target, false));

    const [first, next] = (yield* Orchestrator.OrchestratorV2.pipe(
      Effect.flatMap((orchestrator) => orchestrator.getThreadProjection(threadId)),
    )).runs;
    assert.equal(first?.status, "completed");
    assert.isNotNull(first?.checkpointId);
    assert.notEqual(next?.status, "queued");
  }).pipe(Effect.provide(layerTest)),
);

it.effect("a checkpoint capture that fails for good completes the run and starts the queue", () =>
  Effect.gen(function* () {
    const threadId = ThreadId.make("thread:waiting-capture-fails");
    yield* createThread(threadId);
    yield* send(threadId, "work", "start_immediately");
    const target = yield* finishTurn(threadId, unsnapshottableCwd);
    yield* send(threadId, "next", "queue_after_active");

    // Attempts the worker will retry leave the run waiting for the next one.
    for (let attempt = 1; attempt < 5; attempt += 1) {
      assert.isTrue(Exit.isFailure(yield* finalize(threadId, target, true)));
      assert.deepEqual(yield* runStatuses(threadId), ["waiting", "queued"]);
    }

    yield* settleAndAwaitQueueStart(
      threadId,
      finalize(threadId, target, false).pipe(
        Effect.map((exit) => assert.isTrue(Exit.isFailure(exit))),
      ),
    );

    const projection = yield* Orchestrator.OrchestratorV2.pipe(
      Effect.flatMap((orchestrator) => orchestrator.getThreadProjection(threadId)),
    );
    const [first, next] = projection.runs;
    assert.equal(first?.status, "completed");
    assert.isNull(first?.checkpointId);
    assert.equal(
      projection.nodes.find((node) => node.id === first?.rootNodeId)?.status,
      "completed",
    );
    assert.notEqual(next?.status, "queued");
  }).pipe(Effect.provide(layerTest)),
);
