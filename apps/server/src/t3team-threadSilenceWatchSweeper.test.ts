// @effect-diagnostics globalTimers:off - one test settles an async tick with a real macrotask.
import { describe, expect, it } from "vite-plus/test";

import { type ThreadSilenceActivityState } from "./orchestration/ThreadSilenceWatchdog.ts";
import { type ThreadSilenceWatchRecord } from "./t3team-threadSilenceWatch.ts";
import { makeThreadSilenceWatchIndex } from "./t3team-threadSilenceWatchIndex.ts";
import {
  makeThreadSilenceWatchSweeper,
  type ThreadSilenceWatchClock,
} from "./t3team-threadSilenceWatchSweeper.ts";

/** A fake clock whose interval callback the test fires manually. */
function makeFakeClock() {
  let nowMs = 0;
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

const watch = (over: Partial<ThreadSilenceWatchRecord> = {}): ThreadSilenceWatchRecord => ({
  watchId: "w1",
  watcherThreadId: "watcher",
  targetThreadId: "target",
  targetTitle: "QA child",
  timeoutMs: 900_000,
  ...over,
});

describe("makeThreadSilenceWatchSweeper", () => {
  it("(a) emits thread.silent after the per-subscription timeout with no activity", async () => {
    const index = makeThreadSilenceWatchIndex();
    index.add(watch());
    const fake = makeFakeClock();
    const notified: Array<{ watchId: string; nowMs: number }> = [];
    const sweeper = makeThreadSilenceWatchSweeper({
      index,
      getActivityState: () => ({ lastActivityAtMs: 0, pendingToolCount: 0 }),
      notifyDue: async (watches, nowMs) => {
        for (const record of watches) notified.push({ watchId: record.watchId, nowMs });
      },
      clock: fake.clock,
      tickMs: 5_000,
    });
    sweeper.start();

    fake.advance(899_999);
    fake.fireTick();
    expect(notified).toHaveLength(0);

    fake.advance(1); // now = 900_000 = exactly the timeout
    fake.fireTick();
    expect(notified).toHaveLength(1);
    expect(notified[0]?.watchId).toBe("w1");
    expect(notified[0]?.nowMs).toBe(900_000);
  });

  it("(b) activity resets the timer: no false positive after a recent event", async () => {
    const index = makeThreadSilenceWatchIndex();
    index.add(watch());
    let lastActivityAtMs = 0;
    const fake = makeFakeClock();
    const notified: Array<{ watchId: string; nowMs: number }> = [];
    const sweeper = makeThreadSilenceWatchSweeper({
      index,
      getActivityState: () => ({ lastActivityAtMs, pendingToolCount: 0 }),
      notifyDue: async (watches, nowMs) => {
        for (const record of watches) notified.push({ watchId: record.watchId, nowMs });
      },
      clock: fake.clock,
      tickMs: 5_000,
    });
    sweeper.start();

    fake.advance(600_000);
    lastActivityAtMs = 600_000; // activity at t=600s
    fake.fireTick();
    expect(notified).toHaveLength(0); // only 600s of silence so far

    fake.advance(899_999); // t=1_499_999: 899_999ms since the activity
    fake.fireTick();
    expect(notified).toHaveLength(0);

    fake.advance(1); // t=1_500_000: exactly 900_000ms since the activity
    fake.fireTick();
    expect(notified).toHaveLength(1);
    expect(notified[0]?.nowMs).toBe(1_500_000);
  });

  it("(d) two subscriptions with different timeouts fire at their own times", async () => {
    const index = makeThreadSilenceWatchIndex();
    index.add(watch({ watchId: "qa", targetThreadId: "qa-child", timeoutMs: 900_000 }));
    index.add(watch({ watchId: "build", targetThreadId: "build-child", timeoutMs: 1_800_000 }));
    const fake = makeFakeClock();
    const notified: Array<{ watchId: string; nowMs: number }> = [];
    const sweeper = makeThreadSilenceWatchSweeper({
      index,
      getActivityState: () => ({ lastActivityAtMs: 0, pendingToolCount: 0 }),
      notifyDue: async (watches, nowMs) => {
        for (const record of watches) notified.push({ watchId: record.watchId, nowMs });
      },
      clock: fake.clock,
      tickMs: 5_000,
    });
    sweeper.start();

    fake.advance(900_000);
    fake.fireTick();
    expect(notified.map((entry) => entry.watchId)).toEqual(["qa"]); // only the QA child is due

    fake.advance(900_000); // t=1_800_000
    fake.fireTick();
    // The build child breaches for the first time; the QA child re-fires at its 2nd multiple.
    expect(notified.map((entry) => entry.watchId)).toEqual(["qa", "qa", "build"]);
    expect(notified[1]?.nowMs).toBe(1_800_000);
    expect(notified[2]?.nowMs).toBe(1_800_000);
  });

  it("(e) a removed watch (cancelled) stops firing; stop() clears the timer", async () => {
    const index = makeThreadSilenceWatchIndex();
    index.add(watch());
    const fake = makeFakeClock();
    const notified: Array<{ watchId: string }> = [];
    const sweeper = makeThreadSilenceWatchSweeper({
      index,
      getActivityState: () => ({ lastActivityAtMs: 0, pendingToolCount: 0 }),
      notifyDue: async (watches) => {
        for (const record of watches) notified.push({ watchId: record.watchId });
      },
      clock: fake.clock,
      tickMs: 5_000,
    });
    sweeper.start();

    fake.advance(900_000);
    fake.fireTick();
    expect(notified).toHaveLength(1);

    index.remove("w1"); // cancelled
    fake.advance(900_000);
    fake.fireTick();
    expect(notified).toHaveLength(1); // no further events

    sweeper.stop();
    expect(fake.wasCleared()).toBe(true);
  });

  it("re-emits at each multiple of the timeout while silence persists", async () => {
    const index = makeThreadSilenceWatchIndex();
    index.add(watch());
    const fake = makeFakeClock();
    const notified: Array<{ nowMs: number }> = [];
    const markNotifiedAt: number[] = [];
    const sweeper = makeThreadSilenceWatchSweeper({
      index,
      getActivityState: () => ({ lastActivityAtMs: 0, pendingToolCount: 0 }),
      notifyDue: async (watches, nowMs) => {
        for (const record of watches) {
          notified.push({ nowMs });
          markNotifiedAt.push(nowMs);
          index.markNotified(record.watchId, nowMs);
        }
      },
      clock: fake.clock,
      tickMs: 5_000,
    });
    sweeper.start();

    fake.advance(900_000);
    fake.fireTick();
    fake.advance(400_000); // t=1_300_000: not yet the 2nd multiple
    fake.fireTick();
    expect(notified).toHaveLength(1);
    fake.advance(500_000); // t=1_800_000: the 2nd multiple
    fake.fireTick();
    expect(notified).toHaveLength(2);
    expect(notified.map((entry) => entry.nowMs)).toEqual([900_000, 1_800_000]);
    expect(markNotifiedAt).toEqual([900_000, 1_800_000]);
  });

  it("does NOT fire on missing activity state (no data is not silence)", async () => {
    const index = makeThreadSilenceWatchIndex();
    index.add(watch());
    const fake = makeFakeClock();
    const notified: Array<{ watchId: string }> = [];
    const sweeper = makeThreadSilenceWatchSweeper({
      index,
      getActivityState: (): ThreadSilenceActivityState | undefined => undefined,
      notifyDue: async (watches) => {
        for (const record of watches) notified.push({ watchId: record.watchId });
      },
      clock: fake.clock,
      tickMs: 5_000,
    });
    sweeper.start();

    fake.advance(10_000_000);
    fake.fireTick();
    expect(notified).toHaveLength(0);
  });

  it("reports sweep failures via onWarn instead of throwing", async () => {
    const index = makeThreadSilenceWatchIndex();
    index.add(watch());
    const fake = makeFakeClock();
    const warnings: string[] = [];
    const sweeper = makeThreadSilenceWatchSweeper({
      index,
      getActivityState: () => ({ lastActivityAtMs: 0, pendingToolCount: 0 }),
      notifyDue: async () => {
        throw new Error("dispatch blew up");
      },
      clock: fake.clock,
      tickMs: 5_000,
      onWarn: (message) => {
        warnings.push(message);
      },
    });
    sweeper.start();

    fake.advance(900_000);
    fake.fireTick();
    await new Promise((resolve) => setTimeout(resolve, 0)); // let the async tick settle
    expect(warnings).toEqual(["thread-silence watchdog sweep failed"]);
  });
});
