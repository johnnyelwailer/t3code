import { describe, expect, it } from "vite-plus/test";

import { createActivityStateTracker, type ThreadActivityState } from "./t3team-activityState.ts";

interface TimerHarness {
  fire: (index: number) => Promise<void>;
  delays: number[];
  setTimer: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  clearTimer: (timer: ReturnType<typeof setTimeout>) => void;
}

/** Manual timer capture: each setTimer records the delay and the callback. */
const makeTimers = (): TimerHarness => {
  const callbacks: Array<() => void> = [];
  const delays: number[] = [];
  return {
    delays,
    fire: async (index: number) => {
      await callbacks[index]?.();
    },
    setTimer: (callback: () => void, delayMs: number) => {
      delays.push(delayMs);
      callbacks.push(callback);
      return delayMs as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimer: () => undefined,
  };
};

const makeTracker = (timers?: TimerHarness) => {
  const persisted: Array<{ threadId: string; state: ThreadActivityState | null }> = [];
  const tracker = createActivityStateTracker({
    persist: async ({ threadId, state }) => {
      persisted.push({ threadId, state });
    },
    ...(timers ? { setTimer: timers.setTimer, clearTimer: timers.clearTimer } : {}),
  });
  return { tracker, persisted };
};

describe("activity state tracker (GHE #208)", () => {
  it("derives thinking / writing / working deterministically from coarse events", () => {
    const { tracker, persisted } = makeTracker();
    tracker.note({ threadId: "t1", type: "turn-started" });
    tracker.note({ threadId: "t1", type: "reasoning-delta" });
    tracker.note({ threadId: "t1", type: "assistant-delta" });
    tracker.note({ threadId: "t1", type: "tool-started" });
    tracker.note({ threadId: "t1", type: "tool-completed" });
    expect(persisted).toEqual([
      { threadId: "t1", state: "thinking" },
      { threadId: "t1", state: "writing" },
      { threadId: "t1", state: "working" },
      { threadId: "t1", state: "thinking" },
    ]);
    expect(tracker.stateOf("t1")).toBe("thinking");
  });

  it("persists only transitions — repeated deltas of the same state never persist", () => {
    const { tracker, persisted } = makeTracker();
    for (let i = 0; i < 50; i += 1) tracker.note({ threadId: "t1", type: "reasoning-delta" });
    expect(persisted).toEqual([{ threadId: "t1", state: "thinking" }]);
  });

  it("holds `working` for the whole in-flight tool window and resumes after", () => {
    const { tracker, persisted } = makeTracker();
    tracker.note({ threadId: "t1", type: "tool-started" });
    tracker.note({ threadId: "t1", type: "tool-started" });
    tracker.note({ threadId: "t1", type: "tool-completed" });
    // Second tool still in flight: stays working.
    tracker.note({ threadId: "t1", type: "tool-completed" });
    expect(persisted.map((entry) => entry.state)).toEqual(["working", "thinking"]);
  });

  it("promotes to waiting after the idle gap, but only with no tool in flight", async () => {
    const timers = makeTimers();
    const { tracker, persisted } = makeTracker(timers);
    tracker.note({ threadId: "t1", type: "reasoning-delta" });
    // Re-arm happens on every observation; fire the LAST armed timer.
    await timers.fire(timers.delays.length - 1);
    expect(persisted.at(-1)).toEqual({ threadId: "t1", state: "waiting" });

    const timers2 = makeTimers();
    const concurrent = makeTracker(timers2);
    concurrent.tracker.note({ threadId: "t2", type: "tool-started" });
    await timers2.fire(timers2.delays.length - 1);
    expect(concurrent.persisted.map((entry) => entry.state)).toEqual(["working"]);
  });

  it("output observations (tool streams) re-arm the idle gap without changing state", async () => {
    const timers = makeTimers();
    const { tracker, persisted } = makeTracker(timers);
    tracker.note({ threadId: "t1", type: "tool-started" });
    tracker.note({ threadId: "t1", type: "output" });
    expect(persisted.map((entry) => entry.state)).toEqual(["working"]);
  });

  it("clears (persists null) on turn end and drops the tracking entry", async () => {
    const { tracker, persisted } = makeTracker();
    tracker.note({ threadId: "t1", type: "reasoning-delta" });
    tracker.note({ threadId: "t1", type: "turn-ended" });
    expect(persisted).toEqual([
      { threadId: "t1", state: "thinking" },
      { threadId: "t1", state: null },
    ]);
    // A later domain idle clear() finds no entry: no double persist.
    await tracker.clear("t1");
    expect(persisted.length).toBe(2);
  });

  it("drops the state while blocked on user input and resumes thinking after", () => {
    const { tracker, persisted } = makeTracker();
    tracker.note({ threadId: "t1", type: "reasoning-delta" });
    tracker.note({ threadId: "t1", type: "input-requested" });
    tracker.note({ threadId: "t1", type: "input-resumed" });
    expect(persisted.map((entry) => entry.state)).toEqual(["thinking", null, "thinking"]);
  });

  it("tracks threads independently", () => {
    const { tracker, persisted } = makeTracker();
    tracker.note({ threadId: "a", type: "assistant-delta" });
    tracker.note({ threadId: "b", type: "tool-started" });
    expect(persisted).toEqual([
      { threadId: "a", state: "writing" },
      { threadId: "b", state: "working" },
    ]);
    tracker.note({ threadId: "a", type: "turn-ended" });
    expect(tracker.stateOf("b")).toBe("working");
  });
});
