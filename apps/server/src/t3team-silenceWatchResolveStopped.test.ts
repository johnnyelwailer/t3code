import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { makeTerminalNoticeGate } from "./t3team-terminalNoticeGate.ts";
import { resolveSilenceWatchStopped } from "./t3team-silenceWatchResolveStopped.ts";
import type {
  ThreadSilenceDetectedPayload,
  ThreadSilenceWatchRecord,
} from "./t3team-threadSilenceWatch.ts";
import type { TerminalNotifyLedger } from "./t3team-terminalNotifyDedup.ts";

/**
 * Deterministic tests for the stopped-resolver: ready/idle close watches
 * silently, true terminals notify, and the canonical gate coalesces repeats of
 * the same episode within the quiet window. A passthrough ledger isolates the
 * resolver's own decisions from the ledger's epoch dedup.
 *
 * @module t3team-silenceWatchResolveStopped.test
 */
const record = (watchId: string, watcher = "parent", target = "child"): ThreadSilenceWatchRecord => ({
  watchId,
  watcherThreadId: watcher,
  targetThreadId: target,
  targetTitle: "QA",
  timeoutMs: 900_000,
});

/** A ledger that always honors a notify (so we test the resolver, not the ledger). */
const passthroughLedger = (): TerminalNotifyLedger =>
  ({ notify: (input: { doNotify: Effect.Effect<void> }) => input.doNotify }) as unknown as TerminalNotifyLedger;

interface Emitted {
  readonly watchId: string;
  readonly reason: string;
  readonly stoppedStatus?: string | undefined;
}

function makeFixtures(
  records: ThreadSilenceWatchRecord[],
  options: { nowMs?: () => number; quietMs?: number } = {},
) {
  const removed: string[] = [];
  const emitted: Emitted[] = [];
  const deps = {
    forTarget: (): ReadonlyArray<ThreadSilenceWatchRecord> => records,
    removeWatch: (watchId: string) => {
      removed.push(watchId);
    },
    dedup: passthroughLedger(),
    noticeGate: makeTerminalNoticeGate(options),
    getActivityState: () => ({ lastActivityAtMs: 0, pendingToolCount: 1 }),
    emitDetected: (rec: ThreadSilenceWatchRecord, payload: ThreadSilenceDetectedPayload) => {
      emitted.push({ watchId: rec.watchId, reason: payload.reason, stoppedStatus: payload.stoppedStatus });
      return Effect.void;
    },
  };
  return { deps, removed, emitted };
}

describe("resolveSilenceWatchStopped", () => {
  it.effect("closes ready/idle watches silently - no terminal notice", () =>
    Effect.gen(function* () {
      for (const status of ["ready", "idle"] as const) {
        const fx = makeFixtures([record("w1"), record("w2")]);
        yield* resolveSilenceWatchStopped(fx.deps, "child", status, 10);
        expect(fx.emitted).toEqual([]);
        expect(fx.removed).toEqual(["w1", "w2"]);
      }
    }),
  );

  it.effect("notifies once per watch for a true terminal", () =>
    Effect.gen(function* () {
      const fx = makeFixtures([record("w1")]);
      yield* resolveSilenceWatchStopped(fx.deps, "child", "error", 10);
      expect(fx.emitted).toEqual([{ watchId: "w1", reason: "stopped", stoppedStatus: "error" }]);
      expect(fx.removed).toEqual(["w1"]);
    }),
  );

  it.effect("treats the synthetic 'deleted' marker as a terminal", () =>
    Effect.gen(function* () {
      const fx = makeFixtures([record("w1")]);
      yield* resolveSilenceWatchStopped(fx.deps, "child", "deleted", 10);
      expect(fx.emitted).toHaveLength(1);
      expect(fx.emitted[0]?.stoppedStatus).toBe("deleted");
    }),
  );

  it.effect("coalesces a re-watch of the same terminal episode within the window", () =>
    Effect.gen(function* () {
      // Two watches (a re-watch) on the same recipient+target, same stop.
      const fx = makeFixtures([record("w1"), record("w2")], { nowMs: () => 1_000, quietMs: 120_000 });
      yield* resolveSilenceWatchStopped(fx.deps, "child", "error", 10);
      // Same recipient+kind+episode: only the first delivery passes the gate.
      expect(fx.emitted.map((e) => e.watchId)).toEqual(["w1"]);
      expect(fx.removed).toEqual(["w1", "w2"]);
    }),
  );

  it.effect("delivers a genuinely new terminal episode after the quiet window", () =>
    Effect.gen(function* () {
      let now = 0;
      const fx = makeFixtures([record("w1")], { nowMs: () => now, quietMs: 120_000 });
      yield* resolveSilenceWatchStopped(fx.deps, "child", "error", 1);
      now += 121_000; // beyond the window - the child failed again after a quiet period
      yield* resolveSilenceWatchStopped(fx.deps, "child", "error", 2);
      expect(fx.emitted.map((e) => e.watchId)).toEqual(["w1", "w1"]);
    }),
  );

  it.effect("does not coalesce across different recipients for the same target", () =>
    Effect.gen(function* () {
      const fx = makeFixtures(
        [record("w1", "parentA", "child"), record("w2", "parentB", "child")],
        { nowMs: () => 0, quietMs: 120_000 },
      );
      yield* resolveSilenceWatchStopped(fx.deps, "child", "error", 1);
      // Two different recipients for the same target stop are distinct keys.
      expect(fx.emitted.map((e) => e.watchId)).toEqual(["w1", "w2"]);
    }),
  );
});
