/**
 * End-to-end: a pack provider bridged onto orchestration V2 receives every automated wake as an
 * ordinary turn — a provider-native continuation it requested (background job finished) and an
 * agent-to-agent message — with the provenance fields that tell it who started the turn.
 */
import { assert, it } from "@effect/vitest";
import {
  CommandId,
  MessageId,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  ThreadId,
  type OrchestrationV2DomainEvent,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Stream from "effect/Stream";

import * as EffectWorker from "./orchestration-v2/EffectWorker.ts";
import * as Orchestrator from "./orchestration-v2/Orchestrator.ts";
import * as ProviderAdapterRegistry from "./orchestration-v2/ProviderAdapterRegistry.ts";
import * as ProviderContinuationRequests from "./orchestration-v2/ProviderContinuationRequests.ts";
import { makeOrchestratorV2ReplayLayerWithRegistry } from "./orchestration-v2/testkit/ProviderReplayHarness.ts";
import { checkpointWorkspace } from "./orchestration-v2/testkit/ReplayFixtureWorkspace.ts";
import { makeScriptedPack, PACK_DRIVER } from "./t3team-pack-driver.fixtures.ts";
import { makePackOrchestrationAdapter } from "./t3team-pack-driverAdapter.ts";

const driver = ProviderDriverKind.make(PACK_DRIVER);
const instanceId = ProviderInstanceId.make(PACK_DRIVER);
const modelSelection = { instanceId, model: "example/model" };

it.effect("delivers continuation wakes and agent messages to a pack provider as turns", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const cwd = yield* checkpointWorkspace("t3team-pack-wake");
      const pack = makeScriptedPack({ cwd });
      const registry = ProviderAdapterRegistry.makeLayerEffect(
        Effect.gen(function* () {
          const requests = yield* ProviderContinuationRequests.ProviderContinuationRequests;
          return [
            makePackOrchestrationAdapter({
              adapter: pack.instance.orchestration,
              driver,
              instanceId,
              offerContinuation: requests.offer,
            }),
          ];
        }),
      );
      yield* Effect.gen(function* () {
        const orchestrator = yield* Orchestrator.OrchestratorV2;
        const worker = yield* EffectWorker.OrchestrationEffectWorkerV2;
        const threadId = ThreadId.make("thread:t3team-pack-wake");
        const watch = (predicate: (event: OrchestrationV2DomainEvent) => boolean) =>
          orchestrator.streamDomainEvents.pipe(
            Stream.filter(predicate),
            Stream.take(1),
            Stream.runDrain,
            Effect.forkScoped,
          );
        // A run reaches "waiting" on its provider terminal; draining the effect worker then
        // captures the checkpoint and completes it.
        const runSettled = (event: OrchestrationV2DomainEvent) =>
          event.type === "run.updated" && event.payload.status === "waiting";
        const runCreated = (event: OrchestrationV2DomainEvent) => event.type === "run.created";
        const completeTurn = <E, R>(start: Effect.Effect<void, E, R>) =>
          Effect.gen(function* () {
            const settled = yield* watch(runSettled);
            yield* start;
            yield* worker.drain();
            yield* Fiber.join(settled);
            yield* worker.drain();
          });

        yield* orchestrator.dispatch({
          type: "thread.create",
          commandId: CommandId.make("create"),
          threadId,
          projectId: ProjectId.make("project:t3team-pack-wake"),
          title: "Pack wake",
          modelSelection,
          runtimeMode: "full-access",
          interactionMode: "default",
          branch: null,
          worktreePath: cwd,
          createdBy: "user",
          creationSource: "web",
        });
        yield* completeTurn(
          orchestrator
            .dispatch({
              type: "message.dispatch",
              commandId: CommandId.make("first"),
              threadId,
              messageId: MessageId.make("message:first"),
              text: "first",
              attachments: [],
              modelSelection,
              dispatchMode: { type: "start_immediately" },
              createdBy: "user",
              creationSource: "web",
            })
            .pipe(Effect.asVoid),
        );

        // A background job finished outside any turn: the pack asks the host for a wake, and
        // the continuation worker dispatches it as a run.
        yield* completeTurn(
          Effect.gen(function* () {
            const created = yield* watch(runCreated);
            pack.requestContinuation({
              threadId,
              providerThreadId: `provider-thread:${threadId}`,
              detail: "Background job job-1 finished with exit code 0.",
              notification: {
                source: { kind: "background_command" },
                outcome: "completed",
                summary: "Background job finished",
              },
              delivery: "message_text",
            });
            yield* Fiber.join(created);
          }),
        );

        // Another agent messages this thread (agent-to-agent / delegated delivery).
        yield* completeTurn(
          orchestrator
            .dispatch({
              type: "message.dispatch",
              commandId: CommandId.make("agent"),
              threadId,
              messageId: MessageId.make("message:agent"),
              text: "Child finished: tests pass.",
              attachments: [],
              dispatchMode: { type: "queue_after_active" },
              createdBy: "agent",
              creationSource: "mcp",
              senderThreadId: ThreadId.make("thread:child"),
            })
            .pipe(Effect.asVoid),
        );

        const projection = yield* orchestrator.getThreadProjection(threadId);
        assert.deepEqual(
          projection.runs.map((run) => run.status),
          ["completed", "completed", "completed"],
        );
        assert.deepEqual(
          pack.turns.map((turn) => [turn.message.createdBy, turn.message.creationSource]),
          [
            ["user", "web"],
            ["agent", "server"],
            ["agent", "mcp"],
          ],
        );
        assert.equal(
          pack.turns[1]?.message.text,
          "Background job job-1 finished with exit code 0.",
        );
        assert.equal(pack.turns[2]?.message.senderThreadId, "thread:child");
        // One session served every turn.
        assert.lengthOf(pack.opened, 1);
      }).pipe(
        Effect.provide(
          makeOrchestratorV2ReplayLayerWithRegistry({ name: "t3team-pack-wake" }, registry, {
            runEffectWorker: false,
            runContinuationWorker: true,
          }),
        ),
      );
    }),
  ),
);
