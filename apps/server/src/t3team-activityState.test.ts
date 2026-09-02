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
  // `minTransitionMs: 0` keeps these tests focused on the deterministic state
  // machine (transitions on every boundary); the debounce is covered by its
  // own tests with a controlled clock below.
  const tracker = createActivityStateTracker({
    persist: async ({ threadId, state }) => {
      persisted.push({ threadId, state });
    },
    minTransitionMs: 0,
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

  it("debounces rapid active-state churn — holds a state until the min interval elapses", () => {
    let t = 0;
    const persisted: Array<{ state: ThreadActivityState | null }> = [];
    const tracker = createActivityStateTracker({
      persist: async ({ state }) => {
        persisted.push({ state });
      },
      now: () => t,
    });
    tracker.note({ threadId: "t1", type: "turn-started" }); // thinking — first state, immediate
    t += 1_000;
    tracker.note({ threadId: "t1", type: "assistant-delta" }); // writing wanted; 1s < 4s → held
    t += 1_000;
    tracker.note({ threadId: "t1", type: "tool-started" }); // working wanted; 2s < 4s → held
    t += 1_000;
    tracker.note({ threadId: "t1", type: "tool-completed" }); // thinking wanted; 3s < 4s → held
    t += 1_500; // t = 5.5s; 5.5s since the last change ≥ 4s
    tracker.note({ threadId: "t1", type: "assistant-delta" }); // writing → applied
    expect(persisted.map((entry) => entry.state)).toEqual(["thinking", "writing"]);
    expect(tracker.stateOf("t1")).toBe("writing");
  });

  it("re-arms the debounce window from the last ACTUAL change, not from suppressed requests", () => {
    let t = 0;
    const persisted: Array<{ state: ThreadActivityState | null }> = [];
    const tracker = createActivityStateTracker({
      persist: async ({ state }) => {
        persisted.push({ state });
      },
      now: () => t,
    });
    tracker.note({ threadId: "t1", type: "tool-started" }); // working @ 0 (first)
    t += 3_000;
    tracker.note({ threadId: "t1", type: "tool-completed" }); // thinking wanted; 3s < 4s → held
    t += 1_500; // t = 4.5s; 4.5s since the working change ≥ 4s
    tracker.note({ threadId: "t1", type: "reasoning-delta" }); // thinking → applied
    t += 3_000;
    tracker.note({ threadId: "t1", type: "assistant-delta" }); // writing wanted; 3s < 4s → held
    expect(persisted.map((entry) => entry.state)).toEqual(["working", "thinking"]);
  });

  it("applies the first active state immediately so a fresh turn never stays on the fallback", () => {
    let t = 0;
    const persisted: Array<{ state: ThreadActivityState | null }> = [];
    const tracker = createActivityStateTracker({
      persist: async ({ state }) => {
        persisted.push({ state });
      },
      now: () => t,
    });
    tracker.note({ threadId: "t1", type: "turn-started" });
    expect(persisted.map((entry) => entry.state)).toEqual(["thinking"]);
  });

  // GHE #297 Defect 2: a pending tool call used to suppress the `waiting`
  // promotion forever — a tool that never reports back pinned the state word
  // on "Working" indefinitely. `ACTIVITY_STATE_TOOL_STALL_CEILING_MS` caps
  // how long that suppression can last.
  describe("tool-stall ceiling (GHE #297 Defect 2)", () => {
    it("stays working across the idle gap while a tool is in flight, then promotes once the stall ceiling elapses", async () => {
      let t = 0;
      const timers = makeTimers();
      const persisted: Array<{ state: ThreadActivityState | null }> = [];
      const tracker = createActivityStateTracker({
        persist: async ({ state }) => {
          persisted.push({ state });
        },
        now: () => t,
        setTimer: timers.setTimer,
        clearTimer: timers.clearTimer,
        idleGapMs: 30_000,
        toolStallCeilingMs: 600_000,
        minTransitionMs: 0,
      });

      tracker.note({ threadId: "t1", type: "tool-started" });
      expect(persisted.map((entry) => entry.state)).toEqual(["working"]);

      // Each idle-gap firing re-arms itself (GHE #297 Defect 2 fix) instead
      // of firing once and giving up: 600_000 / 30_000 = 20 firings before
      // the ceiling is reached.
      for (let i = 0; i < 19; i += 1) {
        t += 30_000;
        await timers.fire(timers.delays.length - 1);
        expect(tracker.stateOf("t1")).toBe("working");
      }
      expect(persisted.map((entry) => entry.state)).toEqual(["working"]);

      t += 30_000; // t = 600_000: the stall ceiling is reached.
      await timers.fire(timers.delays.length - 1);
      expect(persisted.map((entry) => entry.state)).toEqual(["working", "waiting"]);
      expect(tracker.stateOf("t1")).toBe("waiting");
    });

    it("never promotes while a stalled tool keeps getting other output activity", async () => {
      let t = 0;
      const timers = makeTimers();
      const persisted: Array<{ state: ThreadActivityState | null }> = [];
      const tracker = createActivityStateTracker({
        persist: async ({ state }) => {
          persisted.push({ state });
        },
        now: () => t,
        setTimer: timers.setTimer,
        clearTimer: timers.clearTimer,
        idleGapMs: 30_000,
        toolStallCeilingMs: 600_000,
        minTransitionMs: 0,
      });

      tracker.note({ threadId: "t1", type: "tool-started" });
      // Output arrives just before every idle-gap firing, well past where
      // the ceiling would otherwise trip (700_000ms > the 600_000 ceiling),
      // because each "output" observation refreshes `lastOutputAt` and
      // re-arms the timer.
      for (let i = 0; i < 25; i += 1) {
        t += 28_000;
        tracker.note({ threadId: "t1", type: "output" });
        t += 2_000;
        await timers.fire(timers.delays.length - 1);
        expect(tracker.stateOf("t1")).toBe("working");
      }
      expect(persisted.map((entry) => entry.state)).toEqual(["working"]);
    });

    it("resumes normal idle promotion (no ceiling wait) after the stalled tool completes", async () => {
      let t = 0;
      const timers = makeTimers();
      const persisted: Array<{ state: ThreadActivityState | null }> = [];
      const tracker = createActivityStateTracker({
        persist: async ({ state }) => {
          persisted.push({ state });
        },
        now: () => t,
        setTimer: timers.setTimer,
        clearTimer: timers.clearTimer,
        idleGapMs: 30_000,
        toolStallCeilingMs: 600_000,
        minTransitionMs: 0,
      });

      tracker.note({ threadId: "t1", type: "tool-started" });
      t += 30_000;
      tracker.note({ threadId: "t1", type: "tool-completed" }); // thinking, no tool in flight
      expect(persisted.map((entry) => entry.state)).toEqual(["working", "thinking"]);

      // No tool in flight any more: the plain idle gap promotes on the very
      // next firing, without waiting anywhere near the stall ceiling.
      t += 30_000;
      await timers.fire(timers.delays.length - 1);
      expect(persisted.map((entry) => entry.state)).toEqual(["working", "thinking", "waiting"]);
    });
  });
});
