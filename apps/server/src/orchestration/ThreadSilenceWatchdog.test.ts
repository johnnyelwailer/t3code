// @effect-diagnostics globalDate:off - asserts wall-clock stamps recorded by the service.
import { describe, expect, it } from "vite-plus/test";

import * as ThreadSilenceWatchdog from "./ThreadSilenceWatchdog.ts";

describe("ThreadSilenceWatchdog", () => {
  it("records last activity on any event and keeps it monotonic", () => {
    const watchdog = ThreadSilenceWatchdog.make();
    const threadId = "t-silent-1";
    expect(watchdog.getActivityState(threadId)).toBeUndefined();

    const before = Date.now();
    watchdog.recordActivity(threadId);
    const state = watchdog.getActivityState(threadId);
    expect(state).toBeDefined();
    expect(state?.lastActivityAtMs).toBeGreaterThanOrEqual(before);
    expect(state?.pendingToolCount).toBe(0);

    watchdog.recordActivity(threadId);
    expect(watchdog.getActivityState(threadId)?.lastActivityAtMs).toBeGreaterThanOrEqual(
      state?.lastActivityAtMs ?? 0,
    );
  });

  it("tracks in-progress tool items and never goes negative", () => {
    const watchdog = ThreadSilenceWatchdog.make();
    const threadId = "t-silent-2";
    watchdog.recordToolItemStarted(threadId);
    expect(watchdog.getActivityState(threadId)?.pendingToolCount).toBe(1);
    watchdog.recordToolItemStarted(threadId);
    expect(watchdog.getActivityState(threadId)?.pendingToolCount).toBe(2);
    watchdog.recordToolItemCompleted(threadId);
    expect(watchdog.getActivityState(threadId)?.pendingToolCount).toBe(1);
    // A completed item with no matching start (event loss) must not go negative.
    watchdog.recordToolItemCompleted(threadId);
    expect(watchdog.getActivityState(threadId)?.pendingToolCount).toBe(0);
    watchdog.recordToolItemCompleted(threadId);
    expect(watchdog.getActivityState(threadId)?.pendingToolCount).toBe(0);
  });

  it("clearThread drops the state (a dead thread is never silent)", () => {
    const watchdog = ThreadSilenceWatchdog.make();
    const threadId = "t-silent-3";
    watchdog.recordActivity(threadId);
    watchdog.recordToolItemStarted(threadId);
    watchdog.clearThread(threadId);
    expect(watchdog.getActivityState(threadId)).toBeUndefined();
  });

  it("seedActivity seeds only when no live state exists; live state wins", () => {
    const watchdog = ThreadSilenceWatchdog.make();
    const threadId = "t-silent-4";
    watchdog.seedActivity(threadId, 1_000);
    expect(watchdog.getActivityState(threadId)).toEqual({
      lastActivityAtMs: 1_000,
      pendingToolCount: 0,
    });
    // Live activity must not be clobbered by a later (stale) seed.
    watchdog.recordActivity(threadId);
    watchdog.seedActivity(threadId, 1_000);
    expect(watchdog.getActivityState(threadId)?.lastActivityAtMs).toBeGreaterThan(1_000);
  });

  it("threads are tracked independently", () => {
    const watchdog = ThreadSilenceWatchdog.make();
    watchdog.recordActivity("a");
    watchdog.recordToolItemStarted("b");
    expect(watchdog.getActivityState("a")?.pendingToolCount).toBe(0);
    expect(watchdog.getActivityState("b")?.pendingToolCount).toBe(1);
    watchdog.clearThread("a");
    expect(watchdog.getActivityState("b")).toBeDefined();
  });
});
