/**
 * Host turn-inactivity watchdog semantics (ported from the V1
 * `ProviderService.turnWatchdog.test.ts`): budget expiry interrupts the root turn, a missing
 * terminal after the grace settles the run as failed, activity and announced retry backoffs
 * re-arm the budget, and a pending Stop gets the same no-terminal backstop.
 */
import {
  type OrchestrationV2ProviderFailure,
  ProviderDriverKind,
  ProviderThreadId,
  ProviderTurnId,
  RunId,
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
import { makeTurnInactivityWatchdog } from "./t3team-turnInactivityWatchdog.ts";

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

const settleLoop = Effect.gen(function* () {
  for (let index = 0; index < 50; index++) yield* Effect.yieldNow;
});

const makeHarness = (options: { readonly interrupt?: "ok" | "fail" | "no-turn" } = {}) =>
  Effect.gen(function* () {
    const settled = yield* Ref.make(false);
    const pendingStop = yield* Ref.make(false);
    const interrupts = yield* Ref.make(0);
    const failures = yield* Ref.make<ReadonlyArray<OrchestrationV2ProviderFailure>>([]);
    const watchdog = yield* makeTurnInactivityWatchdog(BUDGET_MS);
    yield* watchdog.start({
      isSettled: Ref.get(settled),
      hasPendingStop: Ref.get(pendingStop),
      interruptTurn: Ref.update(interrupts, (count) => count + 1).pipe(
        Effect.andThen(
          options.interrupt === "fail"
            ? Effect.fail("interrupt failed" as const)
            : Effect.succeed(options.interrupt !== "no-turn"),
        ),
      ),
      settle: (failure) =>
        Ref.update(failures, (current) => [...current, failure]).pipe(
          Effect.andThen(Ref.set(settled, true)),
        ),
    });
    const advance = (ms: number) => TestClock.adjust(ms).pipe(Effect.andThen(settleLoop));
    return {
      watchdog,
      advance,
      settled,
      pendingStop,
      interrupts: Ref.get(interrupts),
      codes: Ref.get(failures).pipe(Effect.map((all) => all.map((failure) => failure.code))),
    };
  });

describe("turn inactivity watchdog", () => {
  it.effect("interrupts a silent turn at the budget and settles it after the grace", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness();
      yield* harness.advance(BUDGET_MS - 1_000);
      assert.equal(yield* harness.interrupts, 0);
      yield* harness.advance(1_000);
      assert.equal(yield* harness.interrupts, 1);
      assert.deepEqual(yield* harness.codes, []);
      yield* harness.advance(30_000);
      assert.deepEqual(yield* harness.codes, ["turn_inactivity"]);
      assert.equal(yield* harness.interrupts, 1);
    }),
  );

  it.effect("does not settle when the provider ends the turn within the grace", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness();
      yield* harness.advance(BUDGET_MS);
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
        yield* harness.advance(BUDGET_MS);
        assert.deepEqual(yield* harness.codes, ["turn_inactivity"]);
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
      yield* harness.advance(120_000);
      assert.equal(yield* harness.interrupts, 1);
    }),
  );

  it.effect("a plain event after an announcement re-arms the normal budget", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness();
      yield* harness.watchdog.touch(retryAnnouncement(1_024_000));
      yield* harness.watchdog.touch(activity);
      yield* harness.advance(BUDGET_MS);
      assert.equal(yield* harness.interrupts, 1);
    }),
  );

  it.effect("settles a stopped turn that never reports a terminal", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness();
      yield* Ref.set(harness.pendingStop, true);
      yield* harness.advance(10_000);
      yield* harness.advance(30_000);
      assert.deepEqual(yield* harness.codes, ["interrupt_no_terminal"]);
      // The user's Stop already interrupted the turn; the backstop does not interrupt again.
      assert.equal(yield* harness.interrupts, 0);
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
