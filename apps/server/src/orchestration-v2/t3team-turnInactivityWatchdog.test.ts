/**
 * Host turn-inactivity watchdog semantics (ported from the V1
 * `ProviderService.turnWatchdog.test.ts`): budget expiry interrupts the root turn, a missing
 * terminal after the grace settles the run as failed, activity and announced retry backoffs
 * re-arm the budget, a turn waiting on a person or an open tool call is left alone, and a pending
 * Stop gets a backstop that ends the run as the user's Stop.
 */
import {
  ProviderDriverKind,
  ProviderThreadId,
  ProviderTurnId,
  RunId,
  RuntimeRequestId,
  ThreadId,
  NodeId,
  TurnItemId,
} from "@t3tools/contracts";
import { assert, describe, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";
import * as TestClock from "effect/testing/TestClock";

import type { ProviderAdapterV2Event } from "./ProviderAdapter.ts";
import {
  budgetAfterEvent,
  budgetFromSeconds,
  DEFAULT_TURN_INACTIVITY_TIMEOUT_MS,
} from "./t3team-turnInactivityPolicy.ts";
import { OPEN_TOOL_BUDGET_MS } from "./t3team-turnInactivityWaits.ts";
import {
  makeTurnInactivityWatchdog,
  type TurnInactivityOutcome,
} from "./t3team-turnInactivityWatchdog.ts";

const BUDGET_MS = 60_000;
const DRIVER = ProviderDriverKind.make("codex");

const activity: ProviderAdapterV2Event = {
  type: "provider_turn.updated",
  driver: DRIVER,
  providerTurn: {
    id: ProviderTurnId.make("provider-turn:watchdog"),
    providerThreadId: ProviderThreadId.make("provider-thread:watchdog"),
    nodeId: NodeId.make("node:watchdog"),
    runAttemptId: null,
    nativeTurnRef: null,
    ordinal: 1,
    status: "running",
    startedAt: null,
    completedAt: null,
  },
};

const retryAnnouncement = (retryDelayMs: number): ProviderAdapterV2Event => ({
  type: "turn_item.updated",
  driver: DRIVER,
  turnItem: {
    id: TurnItemId.make("turn-item:retry"),
    threadId: ThreadId.make("thread:watchdog"),
    runId: RunId.make("run:watchdog"),
    nodeId: NodeId.make("node:watchdog"),
    providerThreadId: ProviderThreadId.make("provider-thread:watchdog"),
    providerTurnId: ProviderTurnId.make("provider-turn:watchdog"),
    nativeItemRef: null,
    parentItemId: null,
    ordinal: 101,
    status: "running",
    title: "Retrying",
    startedAt: DateTime.makeUnsafe(0),
    completedAt: null,
    updatedAt: DateTime.makeUnsafe(0),
    type: "error",
    failure: {
      class: "provider_error",
      message: "Gateway busy",
      code: null,
      retryable: true,
    },
    retry: { attempt: 11, maxAttempts: 14, retryDelayMs },
  },
});

const REQUEST_ID = RuntimeRequestId.make("runtime-request:approval");

const approvalRequest = (status: "pending" | "resolved"): ProviderAdapterV2Event => ({
  type: "runtime_request.updated",
  driver: DRIVER,
  runtimeRequest: {
    id: REQUEST_ID,
    nodeId: NodeId.make("node:watchdog"),
    providerTurnId: ProviderTurnId.make("provider-turn:watchdog"),
    nativeRequestRef: null,
    kind: "command",
    status,
    responseCapability: { type: "message" },
    createdAt: DateTime.makeUnsafe(0),
    resolvedAt: null,
  },
});

const toolCall = (status: "running" | "completed"): ProviderAdapterV2Event => ({
  type: "turn_item.updated",
  driver: DRIVER,
  turnItem: {
    id: TurnItemId.make("turn-item:delegate-wait"),
    threadId: ThreadId.make("thread:watchdog"),
    runId: RunId.make("run:watchdog"),
    nodeId: NodeId.make("node:watchdog"),
    providerThreadId: ProviderThreadId.make("provider-thread:watchdog"),
    providerTurnId: ProviderTurnId.make("provider-turn:watchdog"),
    nativeItemRef: null,
    parentItemId: null,
    ordinal: 102,
    status,
    title: "delegate_task",
    startedAt: DateTime.makeUnsafe(0),
    completedAt: null,
    updatedAt: DateTime.makeUnsafe(0),
    type: "dynamic_tool",
    toolName: "delegate_task",
    input: { mode: "wait" },
  },
});

const interruptedTerminal: ProviderAdapterV2Event = {
  type: "turn.terminal",
  driver: DRIVER,
  providerThreadId: ProviderThreadId.make("provider-thread:watchdog"),
  providerTurnId: ProviderTurnId.make("provider-turn:watchdog"),
  runOrdinal: 1,
  status: "interrupted",
  failure: null,
  threadDisposition: "reusable",
};

const settleLoop = Effect.gen(function* () {
  for (let index = 0; index < 50; index++) yield* Effect.yieldNow;
});

const makeHarness = (options: { readonly interrupt?: "ok" | "fail" | "no-turn" } = {}) =>
  Effect.gen(function* () {
    const settled = yield* Ref.make(false);
    const pendingStop = yield* Ref.make(false);
    const requestPending = yield* Ref.make(true);
    const interrupts = yield* Ref.make(0);
    const outcomes = yield* Ref.make<ReadonlyArray<TurnInactivityOutcome>>([]);
    const watchdog = yield* makeTurnInactivityWatchdog(BUDGET_MS);
    yield* watchdog.start({
      isSettled: Ref.get(settled),
      hasPendingStop: Ref.get(pendingStop),
      isRuntimeRequestPending: () => Ref.get(requestPending),
      interruptTurn: Ref.update(interrupts, (count) => count + 1).pipe(
        Effect.andThen(
          options.interrupt === "fail"
            ? Effect.fail("interrupt failed" as const)
            : Effect.succeed(options.interrupt !== "no-turn"),
        ),
      ),
      settle: (outcome) =>
        Ref.update(outcomes, (current) => [...current, outcome]).pipe(
          Effect.andThen(Ref.set(settled, true)),
        ),
    });
    const advance = (ms: number) => TestClock.adjust(ms).pipe(Effect.andThen(settleLoop));
    return {
      watchdog,
      advance,
      settled,
      pendingStop,
      requestPending,
      interrupts: Ref.get(interrupts),
      /** `status:code` of every settlement. */
      codes: Ref.get(outcomes).pipe(
        Effect.map((all) => all.map((outcome) => `${outcome.status}:${outcome.failure.code}`)),
      ),
    };
  });

describe("turn inactivity watchdog", () => {
  it.effect("interrupts a silent turn at the budget and settles it after the grace", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness();
      // Two self-heal re-arms first (GHE #113): the hard interrupt lands after three windows.
      yield* harness.advance(BUDGET_MS * 3 - 1_000);
      assert.equal(yield* harness.interrupts, 0);
      yield* harness.advance(1_000);
      assert.equal(yield* harness.interrupts, 1);
      assert.deepEqual(yield* harness.codes, []);
      yield* harness.advance(30_000);
      assert.deepEqual(yield* harness.codes, ["failed:turn_inactivity"]);
      assert.equal(yield* harness.interrupts, 1);
    }),
  );

  it.effect("re-arms a silent turn on its own up to the self-heal budget, then interrupts", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness();
      yield* harness.advance(BUDGET_MS);
      assert.equal(yield* harness.interrupts, 0); // self-heal 1, still watching
      yield* harness.advance(BUDGET_MS);
      assert.equal(yield* harness.interrupts, 0); // self-heal 2, still watching
      yield* harness.advance(BUDGET_MS);
      assert.equal(yield* harness.interrupts, 1); // budget spent, hard interrupt
    }),
  );

  it.effect("a stream event during self-heal resets the re-arm counter", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness();
      yield* harness.advance(BUDGET_MS); // self-heal 1
      yield* harness.watchdog.touch(activity); // recovery: counter back to 0, fresh plain window
      yield* harness.advance(BUDGET_MS * 2 - 1_000);
      assert.equal(yield* harness.interrupts, 0);
      yield* harness.advance(1_000 + BUDGET_MS - 1_000);
      assert.equal(yield* harness.interrupts, 0);
      yield* harness.advance(1_000 + BUDGET_MS);
      assert.equal(yield* harness.interrupts, 1);
    }),
  );

  it.effect("does not settle when the provider ends the turn within the grace", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness();
      yield* harness.advance(BUDGET_MS * 3);
      assert.equal(yield* harness.interrupts, 1);
      yield* Ref.set(harness.settled, true);
      yield* harness.advance(60_000);
      assert.deepEqual(yield* harness.codes, []);
    }),
  );

  it.effect.each(["fail", "no-turn"] as const)(
    "settles at once when the interrupt cannot be delivered (%s)",
    (interrupt) =>
      Effect.gen(function* () {
        const harness = yield* makeHarness({ interrupt });
        yield* harness.advance(BUDGET_MS * 3);
        assert.deepEqual(yield* harness.codes, ["failed:turn_inactivity"]);
      }),
  );

  it.effect("keeps a turn whose stream keeps producing activity", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness();
      for (let step = 0; step < 5; step++) {
        yield* harness.advance(BUDGET_MS - 5_000);
        yield* harness.watchdog.touch(activity);
      }
      assert.equal(yield* harness.interrupts, 0);
    }),
  );

  it.effect("extends the budget over an announced retry backoff, then re-arms the plain one", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness();
      yield* harness.watchdog.touch(retryAnnouncement(1_024_000));
      yield* harness.advance(1_024_000);
      assert.equal(yield* harness.interrupts, 0);
      // After the extended window: two self-heal re-arms on the plain budget, then the interrupt.
      yield* harness.advance(BUDGET_MS * 3 + 120_000);
      assert.equal(yield* harness.interrupts, 1);
    }),
  );

  it.effect("a plain event after an announcement re-arms the normal budget", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness();
      yield* harness.watchdog.touch(retryAnnouncement(1_024_000));
      yield* harness.watchdog.touch(activity);
      yield* harness.advance(BUDGET_MS * 3);
      assert.equal(yield* harness.interrupts, 1);
    }),
  );

  it.effect("ends a stopped turn that never reports a terminal as the user's Stop", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness();
      yield* Ref.set(harness.pendingStop, true);
      yield* harness.advance(10_000);
      yield* harness.advance(30_000);
      assert.deepEqual(yield* harness.codes, ["interrupted:interrupt_no_terminal"]);
      // The user's Stop already interrupted the turn; the backstop does not interrupt again.
      assert.equal(yield* harness.interrupts, 0);
    }),
  );

  it.effect("a Stop pressed while its own interrupt is unanswered stays the user's Stop", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness();
      yield* harness.advance(BUDGET_MS * 3);
      assert.equal(yield* harness.interrupts, 1);
      yield* Ref.set(harness.pendingStop, true);
      yield* harness.advance(10_000);
      yield* harness.advance(20_000);
      assert.deepEqual(yield* harness.codes, ["interrupted:interrupt_no_terminal"]);
    }),
  );

  it.effect("never interrupts a turn waiting on a person, and re-arms once answered", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness();
      yield* harness.watchdog.touch(approvalRequest("pending"));
      yield* harness.advance(BUDGET_MS * 5);
      assert.equal(yield* harness.interrupts, 0);
      // Answered (the projection says so; the adapter never reported it): a full budget again,
      // then the two self-heal re-arms before the interrupt.
      yield* Ref.set(harness.requestPending, false);
      yield* harness.advance(BUDGET_MS * 3 + 60_000);
      assert.equal(yield* harness.interrupts, 1);
    }),
  );

  it.effect("stretches the budget while a tool call such as a blocking wait is open", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness();
      yield* harness.watchdog.touch(toolCall("running"));
      yield* harness.advance(OPEN_TOOL_BUDGET_MS - 1_000);
      assert.equal(yield* harness.interrupts, 0);
      yield* harness.advance(1_000);
      assert.equal(yield* harness.interrupts, 1);
    }),
  );

  it.effect("a settled tool call restores the plain budget", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness();
      yield* harness.watchdog.touch(toolCall("running"));
      yield* harness.watchdog.touch(toolCall("completed"));
      yield* harness.advance(BUDGET_MS * 3);
      assert.equal(yield* harness.interrupts, 1);
    }),
  );

  it.effect("reads the provider's acknowledgement of its own interrupt as the stall", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness();
      const revise = harness.watchdog.reviseTerminal(interruptedTerminal, (failure) =>
        Effect.succeed({
          ...interruptedTerminal,
          status: "failed" as const,
          failure,
          failureItemOrdinal: 7,
        }),
      );
      const statusOf = (event: ProviderAdapterV2Event) =>
        event.type === "turn.terminal" ? event.status : event.type;
      // Before the watchdog fired, an interrupted terminal is a plain stop.
      assert.equal(statusOf(yield* revise), "interrupted");
      yield* harness.advance(BUDGET_MS * 3);
      const revised = yield* revise;
      assert.equal(statusOf(revised), "failed");
      assert.equal(
        revised.type === "turn.terminal" ? revised.failure?.code : null,
        "turn_inactivity",
      );
      // A user Stop pending at that moment keeps the provider's `interrupted`.
      yield* Ref.set(harness.pendingStop, true);
      assert.equal(statusOf(yield* revise), "interrupted");
    }),
  );

  it.effect("does nothing after stop", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness();
      yield* harness.watchdog.stop;
      yield* harness.advance(BUDGET_MS * 3);
      assert.equal(yield* harness.interrupts, 0);
      assert.deepEqual(yield* harness.codes, []);
    }),
  );
});

describe("turn inactivity budget", () => {
  it("uses the instance budget, falling back to the host default", () => {
    assert.equal(budgetFromSeconds(90), 90_000);
    assert.equal(budgetFromSeconds(undefined), DEFAULT_TURN_INACTIVITY_TIMEOUT_MS);
    assert.equal(budgetFromSeconds(0), DEFAULT_TURN_INACTIVITY_TIMEOUT_MS);
  });

  it("caps an announced backoff at 24 hours", () => {
    assert.equal(budgetAfterEvent(BUDGET_MS, retryAnnouncement(10 * 24 * 3_600_000)), 86_400_000);
    assert.equal(budgetAfterEvent(BUDGET_MS, retryAnnouncement(1_000)), 121_000);
    assert.equal(budgetAfterEvent(BUDGET_MS, activity), BUDGET_MS);
  });
});
