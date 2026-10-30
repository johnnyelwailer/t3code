import { assert, it } from "@effect/vitest";
import {
  CommandId,
  MessageId,
  EventId,
  NodeId,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  ProviderThreadId,
  ProviderTurnId,
  RunAttemptId,
  RunId,
  ThreadId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlitePersistence from "../persistence/Sqlite.ts";
import { CodexProviderCapabilitiesV2 } from "./Adapters/CodexAdapterV2.ts";
import * as Orchestrator from "./Orchestrator.ts";
import * as ProjectionStore from "./ProjectionStore.ts";
import * as ProviderAdapterRegistry from "./ProviderAdapterRegistry.ts";
import * as ProviderReplayHarness from "./testkit/ProviderReplayHarness.ts";
import type * as ProviderAdapter from "@t3tools/provider-core/server/ProviderAdapter";

const instanceId = ProviderInstanceId.make("codex");
const modelSelection = { instanceId, model: "gpt-5.1-codex" };
const adapter = {
  instanceId,
  driver: ProviderDriverKind.make("codex"),
  getCapabilities: () => Effect.succeed(CodexProviderCapabilitiesV2),
  planSelectionTransition: () => Effect.succeed({ type: "apply_on_next_turn" as const }),
  openSession: () => Effect.die("No provider process needed for metadata controls"),
} as ProviderAdapter.ProviderAdapterV2["Service"];
const layerDatabase = SqlitePersistence.layerMemory;
const layerTest = Layer.mergeAll(
  layerDatabase,
  ProjectionStore.layer.pipe(Layer.provide(layerDatabase)),
  ProviderReplayHarness.layerWithRegistry(
    { name: "checkpoint-drain" },
    ProviderAdapterRegistry.layerFromAdapters([adapter]),
    { databaseLayer: layerDatabase, runEffectWorker: false },
  ),
);

it.effect("stops a run that only waits for its checkpoint capture instead of failing", () =>
  Effect.gen(function* () {
    const orchestrator = yield* Orchestrator.OrchestratorV2;
    const projections = yield* ProjectionStore.ProjectionStoreV2;
    const threadId = ThreadId.make("thread:checkpoint-drain");
    const providerThreadId = ProviderThreadId.make("provider-thread:checkpoint-drain");
    const runId = RunId.make("run:checkpoint-drain:1");
    const attemptId = RunAttemptId.make("attempt:checkpoint-drain:1");
    const nodeId = NodeId.make("node:checkpoint-drain:1");
    const providerTurnId = ProviderTurnId.make("provider-turn:checkpoint-drain:1");
    const now = yield* DateTime.now;
    yield* orchestrator.dispatch({
      type: "thread.create",
      commandId: CommandId.make("create-checkpoint-drain"),
      threadId,
      projectId: ProjectId.make("project:checkpoint-drain"),
      title: "Checkpoint drain",
      modelSelection,
      runtimeMode: "full-access",
      interactionMode: "default",
      branch: null,
      worktreePath: null,
      createdBy: "user",
      creationSource: "web",
    });
    yield* projections.apply({
      id: EventId.make("checkpoint-drain:provider-thread"),
      type: "provider-thread.updated",
      threadId,
      occurredAt: now,
      payload: {
        id: providerThreadId,
        driver: adapter.driver,
        providerInstanceId: instanceId,
        providerSessionId: null,
        appThreadId: threadId,
        ownerNodeId: null,
        nativeThreadRef: null,
        nativeConversationHeadRef: null,
        status: "idle",
        firstRunOrdinal: 1,
        lastRunOrdinal: 1,
        handoffIds: [],
        forkedFrom: null,
        createdAt: now,
        updatedAt: now,
      },
    });
    yield* projections.apply({
      id: EventId.make("checkpoint-drain:node"),
      type: "node.updated",
      threadId,
      occurredAt: now,
      payload: {
        id: nodeId,
        threadId,
        runId,
        parentNodeId: null,
        rootNodeId: nodeId,
        kind: "root_turn",
        status: "waiting",
        countsForRun: true,
        providerThreadId,
        providerTurnId,
        nativeItemRef: null,
        runtimeRequestId: null,
        checkpointScopeId: null,
        startedAt: now,
        completedAt: null,
      },
    });
    // The provider turn finished; the run is parked at "waiting" until its
    // post-turn checkpoint capture settles, which can take minutes.
    yield* projections.apply({
      id: EventId.make("checkpoint-drain:run"),
      type: "run.created",
      threadId,
      occurredAt: now,
      payload: {
        id: runId,
        threadId,
        ordinal: 1,
        providerInstanceId: instanceId,
        modelSelection,
        providerThreadId,
        userMessageId: MessageId.make("message:checkpoint-drain:1"),
        rootNodeId: nodeId,
        activeAttemptId: attemptId,
        status: "waiting",
        requestedAt: now,
        startedAt: now,
        completedAt: null,
        checkpointId: null,
        contextHandoffId: null,
      },
    });
    yield* projections.apply({
      id: EventId.make("checkpoint-drain:attempt"),
      type: "run-attempt.created",
      threadId,
      occurredAt: now,
      payload: {
        id: attemptId,
        runId,
        attemptOrdinal: 1,
        rootNodeId: nodeId,
        providerInstanceId: instanceId,
        providerThreadId,
        providerTurnId,
        reason: "initial",
        status: "completed",
        startedAt: now,
        completedAt: now,
      },
    });
    yield* projections.apply({
      id: EventId.make("checkpoint-drain:turn"),
      type: "provider-turn.updated",
      threadId,
      occurredAt: now,
      payload: {
        id: providerTurnId,
        providerThreadId,
        nodeId,
        runAttemptId: attemptId,
        nativeTurnRef: null,
        ordinal: 1,
        status: "completed",
        startedAt: now,
        completedAt: now,
      },
    });

    // Before the fix this failed with "Run ... is not interruptible." while
    // the thread still showed as busy.
    const exit = yield* Effect.exit(
      orchestrator.dispatch({
        type: "run.interrupt",
        commandId: CommandId.make("stop-checkpoint-drain"),
        threadId,
        runId,
      }),
    );
    assert.isTrue(exit._tag === "Success");
    // The capture still owns the run's completion.
    const projection = yield* projections.getThreadProjection(threadId);
    assert.equal(projection.runs.find((run) => run.id === runId)?.status, "waiting");
  }).pipe(Effect.provide(layerTest)),
);
