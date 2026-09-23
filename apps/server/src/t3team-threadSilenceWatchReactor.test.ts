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
  SILENCE_WATCH_TERMINAL_NOTIFIED_KIND,
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
  readonly liveness: Map<string, "working" | "monitoring">;
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
  const liveness = new Map<string, "working" | "monitoring">();
  const fake = makeFakeClock(START);
  const reactor = makeThreadSilenceWatchReactor({
    engine,
    query,
    watchdog,
    clock: fake.clock,
    tickMs: 5_000,
    getLiveness: (threadId) => liveness.get(threadId) ?? null,
  });
  // The reactor's own sweeper runs on the shared fake clock; the test drives
  // its periodic tick through fireTick().
  reactor.startSweeper();
  return {
    dispatches,
    watchdog,
    liveness,
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
    sequence: 1,
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
    sequence: 1,
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
    sequence: 1,
    payload: { threadId: ThreadId.make(TARGET), session: { status, lastError: null } },
  }) as unknown as OrchestrationEvent;

const threadSettled = (threadId: string, sequence = 2): OrchestrationEvent =>
  ({
    type: "thread.settled",
    sequence,
    payload: {
      threadId: ThreadId.make(threadId),
      settledAt: "2026-08-23T12:00:00.000Z",
      updatedAt: "2026-08-23T12:00:00.000Z",
    },
  }) as unknown as OrchestrationEvent;

/**
 * A durable terminal-notified marker (shared dedup ledger, GHE #157): appended
 * on the watcher when watch `dedupKey` reported `resumeThreadId`'s stop at
 * `eventSequence`. Present in a replay, it rehydrates the ledger so the same
 * terminal state is not re-notified.
 */
const terminalNotifiedMarker = (
  dedupKey: string,
  resumeThreadId: string,
  eventSequence: number,
): OrchestrationEvent =>
  ({
    type: "thread.activity-appended",
    sequence: eventSequence + 1,
    payload: {
      threadId: WATCHER,
      activity: {
        kind: SILENCE_WATCH_TERMINAL_NOTIFIED_KIND,
        payload: {
          dedupKey,
          resumeThreadId,
          eventSequence,
          watchId: dedupKey,
          targetThreadId: resumeThreadId,
          stoppedStatus: "error",
        },
      },
    },
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

  it.effect(
    "ready with no live background work closes the watch silently (turn ended, thread idle)",
    () =>
      Effect.gen(function* () {
        const harness = makeHarness({});
        yield* harness.handleEvent(watchRegistered());

        yield* harness.handleEvent(sessionSet("ready"));
        yield* Effect.yieldNow;

        // Root-cause fix: ready is a turn-end, not a terminal - the watch closes
        // with no "reached a terminal state" notice.
        expect(detectedPayloads(harness.dispatches)).toHaveLength(0);
        // The watch is closed: a later sweep emits nothing.
        harness.advance(900_000);
        harness.fireTick();
        yield* settle(harness);
        expect(detectedPayloads(harness.dispatches)).toHaveLength(0);
      }),
  );

  it.effect(
    "last background task settles after ready with no later session-set and stops the watch",
    () =>
      Effect.gen(function* () {
        const harness = makeHarness({});
        yield* harness.handleEvent(watchRegistered());
        harness.liveness.set(TARGET, "monitoring");

        // Turn ends while a background job is live: waiting, not stopped.
        yield* harness.handleEvent(sessionSet("ready"));
        yield* Effect.yieldNow;
        expect(detectedPayloads(harness.dispatches)).toHaveLength(0);

        // The watch is still armed: a sweep can still report silence...
        harness.advance(900_000);
        harness.fireTick();
        yield* settle(harness);
        expect(
          detectedPayloads(harness.dispatches).some(
            (p) => (p as { reason?: string }).reason === "silent",
          ),
        ).toBe(true);

        // Task completion only clears the in-memory liveness entry; it does
        // not dispatch another session-set. The next deterministic sweep must
        // re-evaluate the remembered ready state and close the watch silently
        // (ready is not a terminal - no "stopped" notice).
        harness.liveness.delete(TARGET);
        harness.fireTick();
        yield* settle(harness);
        expect(
          detectedPayloads(harness.dispatches).filter(
            (p) => (p as { reason?: string }).reason === "stopped",
          ),
        ).toEqual([]);

        // Resolution removed the watch, so recurring silence stops too: only
        // the single earlier "silent" notice remains.
        harness.advance(900_000);
        harness.fireTick();
        yield* settle(harness);
        expect(detectedPayloads(harness.dispatches)).toHaveLength(1);
      }),
  );

  it.effect("unknown session statuses are ignored by the stop path", () =>
    Effect.gen(function* () {
      const harness = makeHarness({});
      yield* harness.handleEvent(watchRegistered());

      yield* harness.handleEvent(sessionSet("resuming"));
      yield* Effect.yieldNow;
      expect(detectedPayloads(harness.dispatches)).toHaveLength(0);
    }),
  );

  it.effect("cancelled watch cannot leak a stale ready status into a later watch", () =>
    Effect.gen(function* () {
      const harness = makeHarness({});
      yield* harness.handleEvent(watchRegistered());
      harness.liveness.set(TARGET, "working");
      yield* harness.handleEvent(sessionSet("ready"));
      yield* harness.handleEvent(watchCancelled());

      // The projected shell is running. A new watch must use that current
      // state rather than the cancelled watch's remembered ready event.
      harness.liveness.delete(TARGET);
      yield* harness.handleEvent(watchRegistered({ watchId: "w2" }));
      harness.watchdog.state.set(TARGET, { lastActivityAtMs: START, pendingToolCount: 0 });
      harness.fireTick();
      yield* settle(harness);
      expect(detectedPayloads(harness.dispatches)).toHaveLength(0);
    }),
  );

  it.effect("immediate registration resolution clears the previous watch's ready cache", () =>
    Effect.gen(function* () {
      const targetShell = {
        ...TARGET_SHELL,
        session: { status: "running" },
      } as unknown as { session: { status: string } };
      const harness = makeHarness({ targetShell });
      yield* harness.handleEvent(watchRegistered());
      harness.liveness.set(TARGET, "working");
      yield* harness.handleEvent(sessionSet("ready"));

      // Registering B after settlement discovers ready in the projection and
      // immediately resolves both pending watches - now silently, since ready
      // is not a terminal.
      harness.liveness.delete(TARGET);
      targetShell.session.status = "ready";
      yield* harness.handleEvent(watchRegistered({ watchId: "w2" }));
      expect(detectedPayloads(harness.dispatches)).toHaveLength(0);

      // A later watch sees running and must not inherit A's cached ready.
      targetShell.session.status = "running";
      yield* harness.handleEvent(watchRegistered({ watchId: "w3" }));
      harness.watchdog.state.set(TARGET, { lastActivityAtMs: START, pendingToolCount: 0 });
      harness.fireTick();
      yield* settle(harness);
      expect(detectedPayloads(harness.dispatches)).toHaveLength(0);
    }),
  );

  it.effect("a registration for a ready target with live background work stays pending", () =>
    Effect.gen(function* () {
      const harness = makeHarness({
        targetShell: { ...TARGET_SHELL, session: { status: "ready" } },
      });
      harness.liveness.set(TARGET, "working");
      yield* harness.handleEvent(watchRegistered());
      yield* Effect.yieldNow;
      expect(detectedPayloads(harness.dispatches)).toHaveLength(0);

      // The periodic recheck also covers a ready shell discovered at
      // registration (for example after reactor startup/rehydration). When the
      // liveness clears, the remembered ready closes the watch silently - no
      // "stopped" notice for a turn-end.
      harness.liveness.delete(TARGET);
      harness.fireTick();
      yield* settle(harness);
      expect(detectedPayloads(harness.dispatches)).toHaveLength(0);
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

  it.effect("thread.settled closes the target's watches with one deduped terminal notice", () =>
    Effect.gen(function* () {
      const harness = makeHarness({});
      // Two subscriptions to the same target: settlement owes the watcher at
      // most ONE terminal notice - the quiet-window gate coalesces the rest.
      yield* harness.handleEvent(watchRegistered());
      yield* harness.handleEvent(watchRegistered({ watchId: "w2" }));

      yield* harness.handleEvent(threadSettled(TARGET));
      yield* Effect.yieldNow;

      const payloads = detectedPayloads(harness.dispatches);
      expect(payloads).toHaveLength(1);
      expect(payloads[0]).toMatchObject({
        reason: "stopped",
        stoppedStatus: "settled",
      });
      const message = (actorMessages(harness.dispatches)[0] as { text: string }).text;
      expect(message).toContain("[Thread stopped]");
      expect(message).toContain("terminal state (settled)");

      // Both watches are closed: the sweeper no longer re-notifies.
      harness.advance(900_000);
      harness.fireTick();
      yield* settle(harness);
      expect(detectedPayloads(harness.dispatches)).toHaveLength(1);
    }),
  );

  it.effect("a settling watcher's own armed watches are dropped without noise", () =>
    Effect.gen(function* () {
      const harness = makeHarness({});
      yield* harness.handleEvent(watchRegistered()); // watcher WATCHER -> TARGET
      yield* harness.handleEvent(watchRegistered({ watchId: "w2", targetThreadId: "other" }));
      harness.watchdog.state.set("other", { lastActivityAtMs: 0, pendingToolCount: 0 });

      yield* harness.handleEvent(threadSettled(WATCHER));
      yield* Effect.yieldNow;
      expect(detectedPayloads(harness.dispatches)).toHaveLength(0);

      // Both of the settled watcher's watches are gone: a later sweep reports
      // nothing for either target.
      harness.advance(900_000);
      harness.fireTick();
      yield* settle(harness);
      expect(detectedPayloads(harness.dispatches)).toHaveLength(0);
    }),
  );

  it.effect("rehydration: a persisted thread.settled is respected - no re-arm at boot", () =>
    Effect.gen(function* () {
      const harness = makeHarness({
        replayEvents: [watchRegistered(), threadSettled(TARGET, 2)],
      });
      yield* harness.rehydrate;
      yield* Effect.yieldNow;
      expect(detectedPayloads(harness.dispatches)).toHaveLength(0);
      // The watch registered before the settlement is not re-armed: it was
      // never even seeded into the watchdog.
      expect(harness.watchdog.getActivityState(TARGET)).toBeUndefined();
      harness.advance(900_000);
      harness.fireTick();
      yield* settle(harness);
      expect(detectedPayloads(harness.dispatches)).toHaveLength(0);
    }),
  );

  it.effect("rehydration: a settled watcher's pending watches are not re-armed", () =>
    Effect.gen(function* () {
      const harness = makeHarness({
        replayEvents: [
          watchRegistered({ watchId: "w2", targetThreadId: "other" }),
          threadSettled(WATCHER, 2),
        ],
      });
      yield* harness.rehydrate;
      yield* Effect.yieldNow;
      expect(detectedPayloads(harness.dispatches)).toHaveLength(0);
      expect(harness.watchdog.getActivityState("other")).toBeUndefined();
      harness.advance(900_000);
      harness.fireTick();
      yield* settle(harness);
      expect(detectedPayloads(harness.dispatches)).toHaveLength(0);
    }),
  );

  it.effect(
    "rehydration: a watch registered after a settlement anchors on the settlement sequence",
    () =>
      Effect.gen(function* () {
        // The target settled @2 (no terminal session-set in the log); a watch
        // registered after it @3 must anchor its terminal marker on the real
        // stop sequence 2, not 0, or every later restart re-reports the
        // same terminal episode.
        const harness = makeHarness({
          targetShell: { ...TARGET_SHELL, session: { status: "stopped" } },
          replayEvents: [threadSettled(TARGET, 2), { ...watchRegistered(), sequence: 3 }],
        });
        yield* harness.rehydrate;
        yield* Effect.yieldNow;
        const payloads = detectedPayloads(harness.dispatches);
        expect(payloads).toHaveLength(1);
        expect(payloads[0]).toMatchObject({
          watchId: "w1",
          reason: "stopped",
          stoppedStatus: "stopped",
        });
        const marker = harness.dispatches.find(
          (command) =>
            command.type === "thread.activity.append" &&
            (command as { activity?: { kind?: string } }).activity?.kind ===
              SILENCE_WATCH_TERMINAL_NOTIFIED_KIND,
        );
        const markerPayload = (marker as { activity: { payload: unknown } }).activity.payload as {
          eventSequence: number;
        };
        expect(markerPayload.eventSequence).toBe(2);
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

  it.effect("rehydration: a persisted terminal-notified marker stops the re-notify", () =>
    Effect.gen(function* () {
      // The target already went terminal before the previous process died; the
      // marker proves the watcher was already told. Rehydration must NOT re-fire.
      const harness = makeHarness({
        targetShell: { ...TARGET_SHELL, session: { status: "stopped" } },
        replayEvents: [watchRegistered(), terminalNotifiedMarker("w1", TARGET, 3)],
      });
      yield* harness.rehydrate;
      yield* Effect.yieldNow;
      expect(detectedPayloads(harness.dispatches)).toHaveLength(0);
      // The watch is closed by resolution (no lingering sweep target).
      harness.advance(900_000);
      harness.fireTick();
      yield* settle(harness);
      expect(detectedPayloads(harness.dispatches)).toHaveLength(0);
    }),
  );

  it.effect("rehydration: no marker means the terminal target still notifies once", () =>
    Effect.gen(function* () {
      const harness = makeHarness({
        targetShell: { ...TARGET_SHELL, session: { status: "stopped" } },
        replayEvents: [watchRegistered()],
      });
      yield* harness.rehydrate;
      yield* Effect.yieldNow;
      const payloads = detectedPayloads(harness.dispatches);
      expect(payloads).toHaveLength(1);
      expect(payloads[0]).toMatchObject({
        watchId: "w1",
        reason: "stopped",
        stoppedStatus: "stopped",
      });
      // The durable marker is written on the watcher so a later rehydrate dedups.
      const markers = harness.dispatches.filter(
        (command) =>
          command.type === "thread.activity.append" &&
          (command as { activity?: { kind?: string } }).activity?.kind ===
            SILENCE_WATCH_TERMINAL_NOTIFIED_KIND,
      );
      expect(markers).toHaveLength(1);
    }),
  );

  const sessionEventSeq = (status: string, sequence: number): OrchestrationEvent =>
    ({
      type: "thread.session-set",
      sequence,
      payload: { threadId: ThreadId.make(TARGET), session: { status, lastError: null } },
    }) as unknown as OrchestrationEvent;

  it.effect(
    "rehydration: a stop in a NEW epoch re-notifies, anchored on the real stop sequence",
    () =>
      Effect.gen(function* () {
        // The target stopped @3, was reported, resumed @5, stopped again @6 -
        // a fresh epoch the watcher still owes one notification. The marker
        // written by the boot re-resolution must anchor on 6, not 0, or every
        // later restart re-reports the same terminal episode.
        const replay = [
          watchRegistered(),
          sessionEventSeq("running", 2),
          sessionEventSeq("error", 3),
          terminalNotifiedMarker("w1", TARGET, 3),
          sessionEventSeq("running", 5),
          sessionEventSeq("error", 6),
        ];
        const harness = makeHarness({
          targetShell: { ...TARGET_SHELL, session: { status: "stopped" } },
          replayEvents: replay,
        });
        yield* harness.rehydrate;
        yield* Effect.yieldNow;
        const payloads = detectedPayloads(harness.dispatches);
        expect(payloads).toHaveLength(1);
        expect(payloads[0]).toMatchObject({
          watchId: "w1",
          reason: "stopped",
          stoppedStatus: "stopped",
        });
        const marker = harness.dispatches.find(
          (command) =>
            command.type === "thread.activity.append" &&
            (command as { activity?: { kind?: string } }).activity?.kind ===
              SILENCE_WATCH_TERMINAL_NOTIFIED_KIND,
        );
        const markerPayload = (marker as { activity: { payload: unknown } }).activity.payload as {
          dedupKey: string;
          resumeThreadId: string;
          eventSequence: number;
        };
        expect(markerPayload).toMatchObject({
          dedupKey: "w1",
          resumeThreadId: TARGET,
          eventSequence: 6,
        });
      }),
  );

  it.effect("rehydration: the boot-resolved marker stops the re-notify on the NEXT restart", () =>
    Effect.gen(function* () {
      // Same history plus the marker the previous boot wrote: a second boot
      // must NOT re-report the same terminal episode.
      const replay = [
        watchRegistered(),
        sessionEventSeq("running", 2),
        sessionEventSeq("error", 3),
        terminalNotifiedMarker("w1", TARGET, 3),
        sessionEventSeq("running", 5),
        sessionEventSeq("error", 6),
        {
          type: "thread.activity-appended",
          sequence: 7,
          payload: {
            threadId: WATCHER,
            activity: {
              kind: SILENCE_WATCH_TERMINAL_NOTIFIED_KIND,
              payload: {
                dedupKey: "w1",
                resumeThreadId: TARGET,
                eventSequence: 6,
                watchId: "w1",
                targetThreadId: TARGET,
                stoppedStatus: "stopped",
              },
            },
          },
        } as unknown as OrchestrationEvent,
      ];
      const harness = makeHarness({
        targetShell: { ...TARGET_SHELL, session: { status: "stopped" } },
        replayEvents: replay,
      });
      yield* harness.rehydrate;
      yield* Effect.yieldNow;
      expect(detectedPayloads(harness.dispatches)).toHaveLength(0);
    }),
  );
});
