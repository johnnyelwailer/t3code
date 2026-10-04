/**
 * End-to-end: the turn-inactivity watchdog fails a run whose provider went silent — whether the
 * provider swallows the watchdog's interrupt or acknowledges it — and the Stop backstop ends a
 * stopped run whose provider never reports a terminal as the user's Stop. Drives the real
 * orchestrator, effect worker and run execution with a scripted provider that never ends a turn.
 */
import type { PackTurnInput } from "@t3team/pack-api";
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
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import * as TestClock from "effect/testing/TestClock";

import {
  completedTurnEvents,
  makeScriptedPack,
  PACK_DRIVER,
} from "../t3team-pack-driver.fixtures.ts";
import { makePackOrchestrationAdapter } from "../t3team-pack-driverAdapter.ts";
import * as EffectWorker from "./EffectWorker.ts";
import * as Orchestrator from "./Orchestrator.ts";
import * as ProviderAdapterRegistry from "./ProviderAdapterRegistry.ts";
import * as ProviderContinuationRequests from "./ProviderContinuationRequests.ts";
import { TurnInactivityPolicy } from "./t3team-turnInactivityPolicy.ts";
import { makeOrchestratorV2ReplayLayerWithRegistry } from "./testkit/ProviderReplayHarness.ts";
import { checkpointWorkspace } from "./testkit/ReplayFixtureWorkspace.ts";

const instanceId = ProviderInstanceId.make(PACK_DRIVER);
const modelSelection = { instanceId, model: "example/model" };
const BUDGET_MS = 60_000;

type Scenario = "silent" | "stop" | "acknowledged";

const runScenario = (name: string, scenario: Scenario) =>
  Effect.scoped(
    Effect.gen(function* () {
      const cwd = yield* checkpointWorkspace(name);
      const stop = scenario === "stop";
      // The provider starts every turn and then goes silent. Interrupts are swallowed, except
      // that an `acknowledged` provider ends the turn `interrupted` when told to.
      const pack = makeScriptedPack({
        cwd,
        autoComplete: false,
        session: {
          startTurn: async (turn: PackTurnInput) => {
            pack.turns.push(turn);
            pack.events.push(completedTurnEvents(turn)[0]);
          },
          interruptTurn: async () => {
            pack.log.push("interruptTurn");
            const turn = pack.turns.at(-1);
            if (scenario !== "acknowledged" || turn === undefined) return;
            pack.events.push({ ...completedTurnEvents(turn)[2], status: "interrupted" });
          },
        },
      });
      const registry = ProviderAdapterRegistry.makeLayerEffect(
        Effect.gen(function* () {
          const requests = yield* ProviderContinuationRequests.ProviderContinuationRequests;
          return [
            makePackOrchestrationAdapter({
              adapter: pack.instance.orchestration,
              driver: ProviderDriverKind.make(PACK_DRIVER),
              instanceId,
              offerContinuation: requests.offer,
            }),
          ];
        }),
      );
      const policy = Layer.succeed(TurnInactivityPolicy, {
        budgetMs: () => Effect.succeed(BUDGET_MS),
        isRuntimeRequestPending: () => Effect.succeed(false),
      });
      return yield* Effect.gen(function* () {
        const orchestrator = yield* Orchestrator.OrchestratorV2;
        const worker = yield* EffectWorker.OrchestrationEffectWorkerV2;
        const threadId = ThreadId.make(`thread:${name}`);
        const watch = (predicate: (event: OrchestrationV2DomainEvent) => boolean) =>
          orchestrator.streamDomainEvents.pipe(
            Stream.filter(predicate),
            Stream.take(1),
            Stream.runDrain,
            Effect.forkScoped,
          );
        yield* orchestrator.dispatch({
          type: "thread.create",
          commandId: CommandId.make("create"),
          threadId,
          projectId: ProjectId.make(`project:${name}`),
          title: "Watchdog",
          modelSelection,
          runtimeMode: "full-access",
          interactionMode: "default",
          branch: null,
          worktreePath: cwd,
          createdBy: "user",
          creationSource: "web",
        });
        const running = yield* watch((event) => event.type === "provider-turn.updated");
        yield* orchestrator.dispatch({
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
        });
        yield* worker.drain();
        yield* Fiber.join(running);
        const runId = (yield* orchestrator.getThreadProjection(threadId)).runs[0]!.id;
        if (stop) {
          yield* orchestrator.dispatch({
            type: "run.interrupt",
            commandId: CommandId.make("stop"),
            threadId,
            runId,
          });
          yield* worker.drain();
        }
        const settled = yield* watch(
          (event) =>
            event.type === "run.updated" &&
            event.payload.id === runId &&
            event.payload.status !== "running",
        );
        // Stop: the backstop's poll notices the pending Stop, then waits out the grace.
        // Silence: the budget expires, the interrupt is swallowed, then the grace runs out.
        // Acknowledged: the budget expires and the provider ends the turn `interrupted` at once.
        yield* TestClock.adjust(stop ? 10_000 : BUDGET_MS);
        if (scenario !== "acknowledged") yield* TestClock.adjust(30_000);
        yield* Fiber.join(settled);
        yield* worker.drain();
        const projection = yield* orchestrator.getThreadProjection(threadId);
        const failure = projection.turnItems.find((item) => item.type === "error");
        return {
          status: projection.runs[0]?.status,
          code: failure?.type === "error" ? failure.failure.code : undefined,
          interrupts: pack.log.filter((entry) => entry === "interruptTurn").length,
          stopAnswered: projection.turnItems.some((item) => item.type === "run_interrupt_result"),
        };
      }).pipe(
        Effect.provide(
          makeOrchestratorV2ReplayLayerWithRegistry({ name }, registry, {
            runEffectWorker: false,
          }).pipe(Layer.provide(policy)),
        ),
      );
    }),
  );

it.effect("settles a silent turn as failed after the watchdog's interrupt goes unanswered", () =>
  Effect.gen(function* () {
    const result = yield* runScenario("t3team-watchdog-silent", "silent");
    assert.equal(result.status, "failed");
    assert.equal(result.code, "turn_inactivity");
    assert.equal(result.interrupts, 1);
  }),
);

it.effect("fails a stalled turn retryably even when the provider acknowledges the interrupt", () =>
  Effect.gen(function* () {
    const result = yield* runScenario("t3team-watchdog-acknowledged", "acknowledged");
    assert.equal(result.status, "failed");
    assert.equal(result.code, "turn_inactivity");
    assert.equal(result.interrupts, 1);
    assert.isFalse(result.stopAnswered);
  }),
);

it.effect("ends a stopped turn whose provider never reports a terminal as stopped", () =>
  Effect.gen(function* () {
    const result = yield* runScenario("t3team-watchdog-stop", "stop");
    // The user's Stop, recorded as such: resumable, never retried as a failure.
    assert.equal(result.status, "interrupted");
    assert.equal(result.code, undefined);
    assert.isTrue(result.stopAnswered);
    // Only the user's Stop interrupted the provider.
    assert.equal(result.interrupts, 1);
  }),
);
