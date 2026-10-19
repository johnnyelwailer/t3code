import { assert, it } from "@effect/vitest";
import { CommandId, ThreadId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/sql/SqlClient";

import * as ServerSettings from "../serverSettings.ts";
import { RESTORE_POINT_UNAVAILABLE_NOTICE } from "./t3team-checkpointCaptureFallback.ts";
import * as EffectOutbox from "./EffectOutbox.ts";
import * as IdAllocator from "@t3tools/provider-core/server/IdAllocator";
import * as Orchestrator from "./Orchestrator.ts";
import * as ProviderRuntimeRecoveryService from "./ProviderRuntimeRecoveryService.ts";
import {
  createThread,
  finalize,
  finishTurn,
  layerTest,
  runStatuses,
  send,
  settleAndAwaitQueueStart,
  threadProjection,
  unsnapshottableCwd,
} from "./testkit/t3team-waitingRunFixtures.ts";

const encodeEffectRequest = Schema.encodeSync(
  Schema.fromJsonString(EffectOutbox.OrchestrationEffectRequestV2),
);

const layerRecovery = Layer.fresh(ProviderRuntimeRecoveryService.layer).pipe(
  Layer.provide(
    Layer.mergeAll(
      EffectOutbox.layer,
      IdAllocator.layer,
      ServerSettings.layerTest({}).pipe(Layer.orDie),
    ),
  ),
  Layer.provideMerge(layerTest),
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

    const [first, next] = (yield* threadProjection(threadId)).runs;
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

    const projection = yield* threadProjection(threadId);
    const [first, next] = projection.runs;
    assert.equal(first?.status, "completed");
    assert.isNull(first?.checkpointId);
    assert.equal(
      projection.nodes.find((node) => node.id === first?.rootNodeId)?.status,
      "completed",
    );
    assert.notEqual(next?.status, "queued");
    assert.deepEqual(
      projection.turnItems.flatMap((item) =>
        item.type === "system_notice" && item.runId === first?.id ? [item.message] : [],
      ),
      [RESTORE_POINT_UNAVAILABLE_NOTICE],
    );
  }).pipe(Effect.provide(layerTest)),
);

it.effect("a restart clears a run left waiting after its capture failed for good", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const recovery = yield* ProviderRuntimeRecoveryService.ProviderRuntimeRecoveryService;
    const orchestrator = yield* Orchestrator.OrchestratorV2;
    const threadId = ThreadId.make("thread:waiting-recovered");
    yield* createThread(threadId);
    yield* send(threadId, "work", "start_immediately");
    const target = yield* finishTurn(threadId, unsnapshottableCwd);
    yield* send(threadId, "next", "queue_after_active");
    // The worker gave up on the capture and nothing settled the run.
    const at = DateTime.formatIso(yield* DateTime.now);
    yield* sql`
      INSERT INTO orchestration_v2_effect_outbox (
        effect_id, command_id, thread_id, effect_type, payload_json, status,
        attempt_count, available_at, created_at, updated_at
      ) VALUES (
        ${`effect:checkpoint.capture:${target.runId}`},
        ${`command:effect:checkpoint.capture:${target.runId}`}, ${threadId}, 'checkpoint.capture',
        ${encodeEffectRequest({ type: "checkpoint.capture", ...target })},
        'failed', 5, ${at}, ${at}, ${at}
      )
    `;

    yield* recovery.reconcile("startup");
    assert.deepEqual(yield* runStatuses(threadId), ["cancelled", "queued:held"]);

    // Recovery holds the queue for the user, and resuming it is no longer blocked.
    yield* orchestrator.dispatch({
      type: "queue.resume",
      commandId: CommandId.make("resume:waiting-recovered"),
      threadId,
    });
    assert.notEqual((yield* threadProjection(threadId)).runs[1]?.status, "queued");
  }).pipe(Effect.provide(layerRecovery)),
);
