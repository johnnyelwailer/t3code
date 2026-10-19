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
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";

import * as SqlitePersistence from "../../persistence/Sqlite.ts";
import { CodexProviderCapabilitiesV2 } from "../Adapters/CodexAdapterV2.ts";
import * as CheckpointCaptureService from "../CheckpointCaptureService.ts";
import * as CheckpointService from "../CheckpointService.ts";
import * as EventSink from "../EventSink.ts";
import * as IdAllocator from "@t3tools/provider-core/server/IdAllocator";
import * as Orchestrator from "../Orchestrator.ts";
import * as ProjectionStore from "../ProjectionStore.ts";
import type * as ProviderAdapter from "@t3tools/provider-core/server/ProviderAdapter";
import * as ProviderAdapterRegistry from "../ProviderAdapterRegistry.ts";
import * as RunFinalizationService from "../RunFinalizationService.ts";
import * as ProviderReplayHarness from "./ProviderReplayHarness.ts";

// A run is "waiting" once its provider turn finished and its checkpoint is saving.
// Tests park a run there, then drive Stop, queued sends, and the capture themselves.

const instanceId = ProviderInstanceId.make("codex");
const modelSelection = { instanceId, model: "gpt-5.1-codex" };
const adapter = {
  instanceId,
  driver: ProviderDriverKind.make("codex"),
  getCapabilities: () => Effect.succeed(CodexProviderCapabilitiesV2),
  planSelectionTransition: () => Effect.succeed({ type: "apply_on_next_turn" as const }),
  openSession: () => Effect.die("Runs here never reach a provider"),
} as ProviderAdapter.ProviderAdapterV2["Service"];
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
export const unsnapshottableCwd = "/repo-without-snapshots";

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
export const layerTest = Layer.fresh(RunFinalizationService.layer).pipe(
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

export const createThread = (threadId: ThreadId) =>
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

export const send = (
  threadId: ThreadId,
  text: string,
  type: "start_immediately" | "queue_after_active",
) =>
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
export const finishTurn = (threadId: ThreadId, cwd = "/repo") =>
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

export const runStatuses = (threadId: ThreadId) =>
  Effect.gen(function* () {
    const orchestrator = yield* Orchestrator.OrchestratorV2;
    const projection = yield* orchestrator.getThreadProjection(threadId);
    return projection.runs.map((run) => `${run.status}${run.queueHeld === true ? ":held" : ""}`);
  });

/** Runs `settle`, then waits for the thread's queued run to leave the queue. */
export const settleAndAwaitQueueStart = <E, R>(
  threadId: ThreadId,
  settle: Effect.Effect<void, E, R>,
) =>
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

export const finalize = (
  threadId: ThreadId,
  target: { readonly runId: RunId; readonly scopeId: CheckpointScopeId },
  willRetry: boolean,
) =>
  Effect.gen(function* () {
    const finalization = yield* RunFinalizationService.RunFinalizationService;
    return yield* Effect.exit(finalization.finalize({ threadId, ...target, willRetry }));
  });

export const stop = (input: {
  readonly threadId: ThreadId;
  readonly runId: RunId;
  readonly holdQueue: boolean;
  readonly click: number;
}) =>
  Orchestrator.OrchestratorV2.pipe(
    Effect.flatMap((orchestrator) =>
      orchestrator.dispatch({
        type: "run.interrupt",
        commandId: CommandId.make(`stop:${input.threadId}:${input.click}`),
        threadId: input.threadId,
        runId: input.runId,
        holdQueue: input.holdQueue,
      }),
    ),
  );

export const threadProjection = (threadId: ThreadId) =>
  Orchestrator.OrchestratorV2.pipe(
    Effect.flatMap((orchestrator) => orchestrator.getThreadProjection(threadId)),
  );

/**
 * Parks a run on its own thread and settles it, waiting for its queued follow-up to
 * start. The orchestrator reacts to finished runs one at a time, in commit order, so
 * once this returns it has also reacted to every run that finished before.
 */
export const awaitEarlierRunReactions = (label: string) =>
  Effect.gen(function* () {
    const threadId = ThreadId.make(`thread:barrier:${label}`);
    yield* createThread(threadId);
    yield* send(threadId, "work", "start_immediately");
    const target = yield* finishTurn(threadId);
    yield* send(threadId, "next", "queue_after_active");
    yield* settleAndAwaitQueueStart(threadId, finalize(threadId, target, false));
  });
