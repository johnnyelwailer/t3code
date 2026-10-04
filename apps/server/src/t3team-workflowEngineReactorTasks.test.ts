/**
 * The reactor's settle rules for a `thread.turn` ask whose provider turn FAILED (GHE #403 §1):
 *   • a durable ask — live or rehydrated — goes to the bounded re-drive with the provider's error;
 *   • a live (black-boxed composition) ask settles with "" so the composition's own check fires;
 *   • a silent turn on a live durable ask still fails the run outright (unchanged).
 * Driven through the production task handler with the REAL registry + turn tracker and a
 * recording stand-in for the re-drive.
 */
import { assert, it } from "@effect/vitest";
import { CommandId, EventId, type OrchestrationEvent, ThreadId, TurnId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import {
  createWorkflowReactorTaskHandler,
  type ThreadSessionSetEvent,
} from "./t3team-workflowEngineReactorTasks.ts";
import {
  makeWorkflowEngineRegistry,
  type WorkflowPendingAsk,
  type WorkflowRegisteredRun,
} from "./t3team-workflowEngineRegistry.ts";
import { type InterruptedTurnRetry, NO_TEXT_MESSAGE } from "./t3team-workflowEngineTurnRetry.ts";
import { createWorkflowTurnTracker } from "./t3team-workflowTurnResolution.ts";

const THREAD = "child-thread";
const RUN = "run-1";
const STEP = `${RUN}:2`;
const ISO = "2026-09-03T00:00:00.000Z";

let sequence = 0;
function sessionSet(input: {
  readonly status: "running" | "ready" | "error";
  readonly activeTurnId: string | null;
  readonly lastError?: string | null;
}): ThreadSessionSetEvent {
  sequence += 1;
  const event: OrchestrationEvent = {
    type: "thread.session-set",
    sequence,
    eventId: EventId.make(`evt-${sequence}`),
    aggregateKind: "thread",
    aggregateId: ThreadId.make(THREAD),
    occurredAt: ISO,
    commandId: CommandId.make(`cmd-${sequence}`),
    causationEventId: null,
    correlationId: CommandId.make(`cmd-${sequence}`),
    metadata: {},
    payload: {
      threadId: ThreadId.make(THREAD),
      session: {
        threadId: ThreadId.make(THREAD),
        status: input.status,
        providerName: "stub",
        runtimeMode: "full-access",
        activeTurnId: input.activeTurnId === null ? null : TurnId.make(input.activeTurnId),
        lastError: input.lastError ?? null,
        updatedAt: ISO,
      },
    },
  };
  return event as ThreadSessionSetEvent;
}

function harness() {
  const registry = makeWorkflowEngineRegistry();
  const tracker = createWorkflowTurnTracker();
  const failed: unknown[] = [];
  const resumed: Array<{ correlationId: string; reply: unknown }> = [];
  const redriven: Array<{ kind: "no-text" | "failed"; error?: string }> = [];
  const settles: Array<{ threadId: string; correlationId: string }> = [];
  const run: WorkflowRegisteredRun = {
    resume: (correlationId, reply) => {
      resumed.push({ correlationId, reply });
      return Promise.resolve();
    },
    cancel: () => {},
    fail: (error) => {
      failed.push(error);
      return Promise.resolve();
    },
  };
  registry.registerRun(RUN, run);
  const turnRetry: InterruptedTurnRetry = {
    settleNoText: () => {
      redriven.push({ kind: "no-text" });
      return Effect.void;
    },
    settleFailedTurn: (_threadId, _pending, _run, error) => {
      redriven.push({ kind: "failed", error });
      return Effect.void;
    },
    processTurnRetry: () => Effect.void,
  };
  const handle = createWorkflowReactorTaskHandler({
    registry,
    tracker,
    armSettle: (threadId, correlationId) => {
      settles.push({ threadId, correlationId });
      return Effect.void;
    },
    turnRetry,
  });
  // Fold the events in, then run the settle the handler armed (in production it fires after
  // the grace window on the same serial lane).
  const drive = (events: ReadonlyArray<ThreadSessionSetEvent>) =>
    Effect.gen(function* () {
      for (const event of events) yield* handle({ kind: "event", event });
      for (const settle of settles.splice(0)) yield* handle({ kind: "settle", ...settle });
    });
  return { registry, run, failed, resumed, redriven, drive };
}

const liveAsk: WorkflowPendingAsk = { runId: RUN, correlationId: STEP, kind: "thread.turn" };

it.effect("re-drives a live durable ask with the provider's error instead of failing the run", () =>
  Effect.gen(function* () {
    const h = harness();
    h.registry.setPending(THREAD, liveAsk);

    yield* h.drive([
      sessionSet({ status: "running", activeTurnId: "turn-1" }),
      sessionSet({ status: "error", activeTurnId: null, lastError: "Request timed out" }),
    ]);

    assert.deepStrictEqual(h.redriven, [{ kind: "failed", error: "Request timed out" }]);
    assert.deepStrictEqual(h.failed, []);
    assert.deepStrictEqual(h.resumed, []);
  }),
);

it.effect("re-drives when the session dies before the turn ever started (gateway down)", () =>
  Effect.gen(function* () {
    const h = harness();
    h.registry.setPending(THREAD, liveAsk);

    yield* h.drive([
      sessionSet({ status: "error", activeTurnId: null, lastError: "ECONNREFUSED" }),
    ]);

    assert.deepStrictEqual(h.redriven, [{ kind: "failed", error: "ECONNREFUSED" }]);
    assert.deepStrictEqual(h.failed, []);
  }),
);

it.effect("settles a live composition ask with an empty reply so its own check fires", () =>
  Effect.gen(function* () {
    const h = harness();
    const live: unknown[] = [];
    h.registry.setPending(THREAD, {
      runId: RUN,
      correlationId: `${RUN}:blackbox:1`,
      kind: "thread.turn",
      resolveLive: (reply) => {
        live.push(reply);
        return Promise.resolve();
      },
    });

    yield* h.drive([
      sessionSet({ status: "running", activeTurnId: "turn-1" }),
      sessionSet({ status: "error", activeTurnId: null, lastError: "gateway 502" }),
    ]);

    assert.deepStrictEqual(live, [""]);
    assert.deepStrictEqual(h.redriven, []);
    assert.deepStrictEqual(h.failed, []);
  }),
);

it.effect("still fails the run outright when a live turn merely says nothing (unchanged)", () =>
  Effect.gen(function* () {
    const h = harness();
    h.registry.setPending(THREAD, liveAsk);

    yield* h.drive([
      sessionSet({ status: "running", activeTurnId: "turn-1" }),
      sessionSet({ status: "ready", activeTurnId: null }),
    ]);

    assert.deepStrictEqual(h.redriven, []);
    assert.strictEqual(h.failed.length, 1);
    assert.strictEqual((h.failed[0] as Error).message, NO_TEXT_MESSAGE);
  }),
);

it.effect(
  "ignores the dead session's tail writes while a re-drive is armed, then judges the new turn",
  () =>
    Effect.gen(function* () {
      const h = harness();
      // What scheduleRedrive leaves behind: the same ask, budget spent once, re-drive armed.
      h.registry.setPending(THREAD, { ...liveAsk, turnRetries: 1, redriveArmed: true });

      // The session-level transient retry's "Retrying (1/3) — …" note: status still `error`,
      // no live turn. Must NOT count as another failed turn.
      yield* h.drive([
        sessionSet({ status: "error", activeTurnId: null, lastError: "Retrying (1/3) — timeout" }),
      ]);
      assert.deepStrictEqual(h.redriven, []);
      assert.strictEqual(h.registry.peekPending(THREAD)?.redriveArmed, true);

      // The re-driven turn starts, then dies for real: THAT is the next verdict.
      yield* h.drive([
        sessionSet({ status: "running", activeTurnId: "turn-2" }),
        sessionSet({ status: "error", activeTurnId: null, lastError: "Request timed out" }),
      ]);
      assert.deepStrictEqual(h.redriven, [{ kind: "failed", error: "Request timed out" }]);
    }),
);

it.effect("a runtime error that keeps the dead turn's id on the session still fails the step", () =>
  Effect.gen(function* () {
    const h = harness();
    h.registry.setPending(THREAD, liveAsk);

    yield* h.drive([
      sessionSet({ status: "running", activeTurnId: "turn-1" }),
      sessionSet({ status: "error", activeTurnId: "turn-1", lastError: "provider crashed" }),
    ]);

    assert.deepStrictEqual(h.redriven, [{ kind: "failed", error: "provider crashed" }]);
    assert.deepStrictEqual(h.failed, []);
  }),
);

it.effect("re-drives a rehydrated ask that says nothing (unchanged)", () =>
  Effect.gen(function* () {
    const h = harness();
    h.registry.setPending(THREAD, { ...liveAsk, turnRetries: 0 });

    yield* h.drive([
      sessionSet({ status: "running", activeTurnId: "turn-1" }),
      sessionSet({ status: "ready", activeTurnId: null }),
    ]);

    assert.deepStrictEqual(h.redriven, [{ kind: "no-text" }]);
    assert.deepStrictEqual(h.failed, []);
  }),
);
