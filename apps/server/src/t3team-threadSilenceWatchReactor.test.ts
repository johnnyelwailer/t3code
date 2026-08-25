/**
 * GHE #63 reactor wiring: registration indexes the watch, the sweep emits the
 * `thread.silent` notification (actor message + durable detected activity)
 * with the pending-tool distinction, cancel/stop/delete clean up the watch,
 * and rehydration rebuilds the pending index from persisted events.
 */
import type { OrchestrationCommand, OrchestrationEvent } from "@t3tools/contracts";
import { ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";

import { type OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.ts";
import { type OrchestrationEventStoreError } from "./persistence/Errors.ts";
import { type ProjectionSnapshotQueryShape } from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import { makeThreadSilenceWatchReactor } from "./t3team-threadSilenceWatchReactor.ts";
import {
  THREAD_SILENCE_DETECTED_KIND,
  THREAD_SILENCE_WATCH_CANCELLED_KIND,
  THREAD_SILENCE_WATCH_REGISTERED_KIND,
} from "./t3team-threadSilenceWatch.ts";
import { type ThreadSilenceWatchClock } from "./t3team-threadSilenceWatchSweeper.ts";

const TARGET = "child-1";
const WATCHER = "parent-1";
const TITLE = "QA child";

/**
 * The fake clock's origin. It must sit AFTER the target shell's updatedAt
 * (the reactor seeds the watchdog from that timestamp), so the seeded
 * "last activity" is in the past on the fake clock.
 */
const START = 1_700_000_000_000; // 2023-11-14T22:13:20Z

// ── Fakes ───────────────────────────────────────────────────────────────────

interface FakeWatchdog {
  readonly state: Map<string, { lastActivityAtMs: number; pendingToolCount: number }>;
  readonly seedActivity: (threadId: string, lastActivityAtMs: number) => void;
  readonly getActivityState: (
    threadId: string,
  ) => { lastActivityAtMs: number; pendingToolCount: number } | undefined;
}

function makeFakeWatchdog(): FakeWatchdog {
  const state = new Map<string, { lastActivityAtMs: number; pendingToolCount: number }>();
  return {
    state,
    seedActivity: (threadId, lastActivityAtMs) => {
      if (!state.has(threadId)) state.set(threadId, { lastActivityAtMs, pendingToolCount: 0 });
    },
    getActivityState: (threadId) => state.get(threadId),
  };
}

function makeFakeClock(startMs = 0) {
  let nowMs = startMs;
  let tick: (() => void) | undefined;
  let cleared = false;
  const clock: ThreadSilenceWatchClock = {
    now: () => nowMs,
    setTimer: (callback) => {
      tick = callback;
      return "timer";
    },
    clearTimer: () => {
      cleared = true;
      tick = undefined;
    },
  };
  return {
    clock,
    advance: (ms: number) => {
      nowMs += ms;
    },
    fireTick: () => {
      tick?.();
    },
    wasCleared: () => cleared,
  };
}

const TARGET_SHELL = {
  id: ThreadId.make(TARGET),
  projectId: "project-1",
  title: TITLE,
  updatedAt: "2023-01-01T00:00:00.000Z",
  session: { status: "running" },
} as unknown as { id: ThreadId; projectId: string; title: string; updatedAt: string };

function makeEngine(replayEvents: OrchestrationEvent[] = []) {
  const dispatches: OrchestrationCommand[] = [];
  const engine = {
    dispatch: (command: OrchestrationCommand) =>
      Effect.sync(() => {
        dispatches.push(command);
        return { sequence: dispatches.length };
      }),
    streamDomainEvents: Stream.empty,
    readEvents: () => Stream.fromIterable(replayEvents),
  } as unknown as OrchestrationEngineShape;
  return { engine, dispatches };
}

function makeQuery(targetShell: unknown) {
  const query = {
    getThreadShellById: () =>
      Effect.succeed(targetShell === null ? Option.none() : Option.some(targetShell)),
  } as unknown as ProjectionSnapshotQueryShape;
  return query;
}

interface Harness {
  readonly dispatches: OrchestrationCommand[];
  readonly watchdog: FakeWatchdog;
  readonly advance: (ms: number) => void;
  readonly fireTick: () => void;
  readonly handleEvent: (event: OrchestrationEvent) => Effect.Effect<void>;
  readonly rehydrate: Effect.Effect<void, OrchestrationEventStoreError>;
  readonly stop: () => void;
}

function makeHarness(input: {
  targetShell?: unknown;
  replayEvents?: OrchestrationEvent[];
}): Harness {
  const { engine, dispatches } = makeEngine(input.replayEvents);
  const query = makeQuery(input.targetShell === undefined ? TARGET_SHELL : input.targetShell);
  const watchdog = makeFakeWatchdog();
  const fake = makeFakeClock(START);
  const reactor = makeThreadSilenceWatchReactor({
    engine,
    query,
    watchdog,
    clock: fake.clock,
    tickMs: 5_000,
  });
  // The reactor's own sweeper runs on the shared fake clock; the test drives
  // its periodic tick through fireTick().
  reactor.startSweeper();
  return {
    dispatches,
    watchdog,
    advance: fake.advance,
    fireTick: fake.fireTick,
    handleEvent: reactor.handleEvent,
    rehydrate: reactor.rehydrate,
    stop: reactor.stop,
  };
}

// ── Event builders ──────────────────────────────────────────────────────────

const watchRegistered = (
  over: { watchId?: string; targetThreadId?: string; timeoutMs?: number } = {},
): OrchestrationEvent =>
  ({
    type: "thread.activity-appended",
    payload: {
      threadId: WATCHER,
      activity: {
        kind: THREAD_SILENCE_WATCH_REGISTERED_KIND,
        payload: {
          watchId: over.watchId ?? "w1",
          targetThreadId: over.targetThreadId ?? TARGET,
          targetTitle: TITLE,
          ...(over.timeoutMs !== undefined ? { timeoutMs: over.timeoutMs } : {}),
        },
      },
    },
  }) as unknown as OrchestrationEvent;

const watchCancelled = (): OrchestrationEvent =>
  ({
    type: "thread.activity-appended",
    payload: {
      threadId: WATCHER,
      activity: {
        kind: THREAD_SILENCE_WATCH_CANCELLED_KIND,
        payload: { targetThreadId: TARGET },
      },
    },
  }) as unknown as OrchestrationEvent;

const sessionSet = (status: string): OrchestrationEvent =>
  ({
    type: "thread.session-set",
    payload: { threadId: ThreadId.make(TARGET), session: { status, lastError: null } },
  }) as unknown as OrchestrationEvent;

const detectedActivities = (dispatches: OrchestrationCommand[]) =>
  dispatches.filter(
    (command) =>
      command.type === "thread.activity.append" &&
      (command as { activity?: { kind?: string } }).activity?.kind === THREAD_SILENCE_DETECTED_KIND,
  );

const detectedPayloads = (dispatches: OrchestrationCommand[]) =>
  detectedActivities(dispatches).map(
    (command) => (command as { activity: { payload: unknown } }).activity.payload,
  );

const actorMessages = (dispatches: OrchestrationCommand[]) =>
  dispatches.filter((command) => command.type === "thread.actor.message");

/**
 * The sweep path is fire-and-forget (the timer tick runs notifyDue async via
 * Effect.runPromise), so poll the microtask queue until the dispatches land -
 * the same settle idiom as the child-wait reactor tests.
 */
const settle = (harness: Harness, count?: number) =>
  Effect.gen(function* () {
    for (let i = 0; i < 200; i += 1) {
      if (count !== undefined && harness.dispatches.length >= count) break;
      yield* Effect.yieldNow;
    }
  });

// ── Tests ───────────────────────────────────────────────────────────────────

describe("makeThreadSilenceWatchReactor", () => {
  it.effect("(a) emits thread.silent after the timeout with the full payload", () =>
    Effect.gen(function* () {
      const harness = makeHarness({});
      yield* harness.handleEvent(watchRegistered());
      // The reactor seeds the target from the shell's updatedAt (10:00:00Z).
      expect(harness.watchdog.getActivityState(TARGET)).toBeDefined();

      harness.advance(900_000); // silence far beyond the default 15m timeout
      harness.fireTick();
      yield* settle(harness);

      const payloads = detectedPayloads(harness.dispatches);
      expect(payloads).toHaveLength(1);
      expect(payloads[0]).toMatchObject({
        watchId: "w1",
        targetThreadId: TARGET,
        targetTitle: TITLE,
        reason: "silent",
        timeoutMs: 900_000,
        pendingToolCall: false,
        pendingToolCount: 0,
      });
      // The actor message drives the watching agent and names the target.
      const messages = actorMessages(harness.dispatches);
      expect(messages).toHaveLength(1);
      expect((messages[0] as { text: string }).text).toContain("[Thread silent]");
      expect((messages[0] as { text: string }).text).toContain(TITLE);
      expect((messages[0] as { threadId: ThreadId }).threadId).toEqual(ThreadId.make(WATCHER));
      expect((messages[0] as { fromThreadId: ThreadId }).fromThreadId).toEqual(
        ThreadId.make(TARGET),
      );
    }),
  );

  it.effect("(b) activity resets the timer: no emission while the target is active", () =>
    Effect.gen(function* () {
      const harness = makeHarness({});
      yield* harness.handleEvent(watchRegistered());

      harness.advance(600_000);
      harness.watchdog.state.set(TARGET, {
        lastActivityAtMs: START + 600_000,
        pendingToolCount: 0,
      });
      harness.fireTick();
      yield* settle(harness);
      expect(detectedPayloads(harness.dispatches)).toHaveLength(0);

      harness.advance(300_000); // 900_000 total, but only 300s since the activity
      harness.fireTick();
      yield* settle(harness);
      expect(detectedPayloads(harness.dispatches)).toHaveLength(0);
    }),
  );

  it.effect("(c) silence WITH a pending tool call is flagged distinctly", () =>
    Effect.gen(function* () {
      const harness = makeHarness({});
      yield* harness.handleEvent(watchRegistered());

      harness.watchdog.state.set(TARGET, { lastActivityAtMs: 0, pendingToolCount: 1 });
      harness.advance(900_000);
      harness.fireTick();
      yield* settle(harness);

      const payload = detectedPayloads(harness.dispatches)[0] as {
        pendingToolCall: boolean;
        pendingToolCount: number;
      };
      expect(payload.pendingToolCall).toBe(true);
      expect(payload.pendingToolCount).toBe(1);
      const message = (actorMessages(harness.dispatches)[0] as { text: string }).text;
      expect(message).toContain("A tool call was still in progress");
      expect(message).not.toContain("may be wedged");
    }),
  );

  it.effect("(d) two subscriptions with different timeouts fire at their own times", () =>
    Effect.gen(function* () {
      const harness = makeHarness({});
      yield* harness.handleEvent(watchRegistered({ watchId: "qa", timeoutMs: 900_000 }));
      yield* harness.handleEvent(
        watchRegistered({ watchId: "build", targetThreadId: "build-child", timeoutMs: 1_800_000 }),
      );
      harness.watchdog.state.set("build-child", { lastActivityAtMs: START, pendingToolCount: 0 });

      harness.advance(900_000);
      harness.fireTick();
      yield* settle(harness);
      expect(
        detectedPayloads(harness.dispatches).map(
          (payload) => (payload as { watchId: string }).watchId,
        ),
      ).toEqual(["qa"]);

      harness.advance(900_000); // t = 1_800_000
      harness.fireTick();
      yield* settle(harness);
      expect(
        detectedPayloads(harness.dispatches).map(
          (payload) => (payload as { watchId: string }).watchId,
        ),
      ).toEqual(["qa", "qa", "build"]);
    }),
  );

  it.effect("(e) cancel removes the watch: no further events", () =>
    Effect.gen(function* () {
      const harness = makeHarness({});
      yield* harness.handleEvent(watchRegistered());

      harness.advance(900_000);
      harness.fireTick();
      yield* settle(harness);
      expect(detectedPayloads(harness.dispatches)).toHaveLength(1);

      yield* harness.handleEvent(watchCancelled());
      harness.advance(900_000);
      harness.fireTick();
      yield* settle(harness);
      expect(detectedPayloads(harness.dispatches)).toHaveLength(1); // no re-emit after cancel
    }),
  );

  it.effect("thread-stopped: a terminal session-set resolves the watch with reason 'stopped'", () =>
    Effect.gen(function* () {
      const harness = makeHarness({});
      yield* harness.handleEvent(watchRegistered());

      yield* harness.handleEvent(sessionSet("error"));
      yield* Effect.yieldNow;

      const payloads = detectedPayloads(harness.dispatches);
      expect(payloads).toHaveLength(1);
      expect(payloads[0]).toMatchObject({
        watchId: "w1",
        reason: "stopped",
        stoppedStatus: "error",
      });
      const message = (actorMessages(harness.dispatches)[0] as { text: string }).text;
      expect(message).toContain("[Thread stopped]");
      expect(message).toContain("terminal state (error)");

      // The watch is closed: a later sweep emits nothing.
      harness.advance(900_000);
      harness.fireTick();
      yield* settle(harness);
      expect(detectedPayloads(harness.dispatches)).toHaveLength(1);
    }),
  );

  it.effect("a registration for an already-terminal target resolves immediately", () =>
    Effect.gen(function* () {
      const harness = makeHarness({
        targetShell: { ...TARGET_SHELL, session: { status: "stopped" } },
      });
      yield* harness.handleEvent(watchRegistered());
      yield* Effect.yieldNow;
      const payloads = detectedPayloads(harness.dispatches);
      expect(payloads).toHaveLength(1);
      expect(payloads[0]).toMatchObject({ reason: "stopped", stoppedStatus: "stopped" });
    }),
  );

  it.effect("a registration for a missing target resolves as deleted", () =>
    Effect.gen(function* () {
      const harness = makeHarness({ targetShell: null });
      yield* harness.handleEvent(watchRegistered());
      yield* Effect.yieldNow;
      const payloads = detectedPayloads(harness.dispatches);
      expect(payloads).toHaveLength(1);
      expect(payloads[0]).toMatchObject({ reason: "stopped", stoppedStatus: "deleted" });
    }),
  );

  it.effect("thread.deleted closes the target's watches and drops the dead watcher's watches", () =>
    Effect.gen(function* () {
      const harness = makeHarness({});
      yield* harness.handleEvent(watchRegistered());
      const deleted = (threadId: string): OrchestrationEvent =>
        ({
          type: "thread.deleted",
          payload: { threadId: ThreadId.make(threadId), deletedAt: "2026-08-23T12:00:00.000Z" },
        }) as unknown as OrchestrationEvent;

      yield* harness.handleEvent(deleted(TARGET));
      yield* Effect.yieldNow;
      expect(detectedPayloads(harness.dispatches)).toHaveLength(1);
      expect(detectedPayloads(harness.dispatches)[0]).toMatchObject({
        reason: "stopped",
        stoppedStatus: "deleted",
      });

      // A second watch whose WATCHER is deleted is dropped without a message.
      yield* harness.handleEvent(watchRegistered({ watchId: "w2", targetThreadId: "other" }));
      harness.watchdog.state.set("other", { lastActivityAtMs: 0, pendingToolCount: 0 });
      yield* harness.handleEvent(deleted(WATCHER));
      yield* Effect.yieldNow;
      expect(detectedPayloads(harness.dispatches)).toHaveLength(1); // no emission for the dead watcher
    }),
  );

  it.effect("rehydration rebuilds the pending index from persisted events", () =>
    Effect.gen(function* () {
      const harness = makeHarness({
        replayEvents: [
          watchRegistered(),
          watchRegistered({ watchId: "w2", targetThreadId: "other" }),
          watchCancelled(), // cancels w1 (same watcher + target)
        ],
      });
      yield* harness.rehydrate;
      // w1 cancelled, w2 pending. Only w2's target gets seeded.
      expect(harness.watchdog.getActivityState(TARGET)).toBeUndefined();
      expect(harness.watchdog.getActivityState("other")).toBeDefined();

      harness.watchdog.state.set("other", { lastActivityAtMs: 0, pendingToolCount: 0 });
      harness.advance(900_000);
      harness.fireTick();
      yield* settle(harness);
      const payloads = detectedPayloads(harness.dispatches);
      expect(payloads).toHaveLength(1);
      expect(payloads[0]).toMatchObject({ watchId: "w2", targetThreadId: "other" });
    }),
  );

  it.effect("stop() clears the sweep timer (no leak)", () =>
    Effect.gen(function* () {
      const harness = makeHarness({});
      yield* harness.handleEvent(watchRegistered());
      harness.stop();
      harness.advance(900_000);
      harness.fireTick(); // the timer was cleared: nothing happens
      yield* Effect.yieldNow;
      expect(detectedPayloads(harness.dispatches)).toHaveLength(0);
    }),
  );
});
