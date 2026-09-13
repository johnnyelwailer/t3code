/**
 * t3team-childCompletionQuiet.ts — the timing gate that makes a settled child
 * eligible for the silent-completion notice only after it has stayed quiet. A
 * resume cancels the pending timer; a re-settle re-arms it; stop() clears all.
 * The default quiet period (COMPLETION_QUIET_PERIOD_MS) is what this test pins.
 */
import { describe, expect, it } from "@effect/vitest";

import {
  COMPLETION_QUIET_PERIOD_MS,
  makeChildCompletionQuiet,
  type ChildCompletionQuietClock,
} from "./t3team-childCompletionQuiet.ts";

function makeFakeClock() {
  let nowMs = 0;
  let nextId = 1;
  const timers = new Map<number, { due: number; callback: () => void }>();
  const clock: ChildCompletionQuietClock = {
    now: () => nowMs,
    setTimer: (callback, delayMs) => {
      const id = nextId++;
      timers.set(id, { due: nowMs + delayMs, callback });
      return id;
    },
    clearTimer: (handle) => {
      timers.delete(handle as number);
    },
  };
  return {
    clock,
    advance: (ms: number) => {
      nowMs += ms;
      const due = [...timers.entries()]
        .filter(([, t]) => t.due <= nowMs)
        .sort((a, b) => a[1].due - b[1].due);
      for (const [id, t] of due) {
        timers.delete(id);
        t.callback();
      }
    },
  };
}

describe("makeChildCompletionQuiet", () => {
  it("fires onQuiet after the DEFAULT quiet period without a resume", async () => {
    const fake = makeFakeClock();
    const fired: Array<{ child: string; seq: number }> = [];
    const quiet = makeChildCompletionQuiet({
      clock: fake.clock,
      // Default period (no override) — this pins the default, not a zero arg.
      onQuiet: async (child, seq) => {
        fired.push({ child, seq });
      },
    });
    quiet.noteSettled("c1", 10);
    fake.advance(COMPLETION_QUIET_PERIOD_MS - 1);
    expect(fired).toHaveLength(0);
    fake.advance(1);
    expect(fired).toEqual([{ child: "c1", seq: 10 }]);
  });

  it("a resume before the period cancels the pending notice", async () => {
    const fake = makeFakeClock();
    const fired: string[] = [];
    const quiet = makeChildCompletionQuiet({
      clock: fake.clock,
      onQuiet: async (child) => {
        fired.push(child);
      },
    });
    quiet.noteSettled("c1", 10);
    quiet.noteResumed("c1"); // the child resumed within the period
    fake.advance(COMPLETION_QUIET_PERIOD_MS * 3);
    expect(fired).toHaveLength(0);
  });

  it("a re-settle re-arms (resets) the quiet period", async () => {
    const fake = makeFakeClock();
    const fired: number[] = [];
    const quiet = makeChildCompletionQuiet({
      clock: fake.clock,
      onQuiet: async (_c, seq) => {
        fired.push(seq);
      },
    });
    quiet.noteSettled("c1", 10);
    fake.advance(COMPLETION_QUIET_PERIOD_MS - 1000);
    quiet.noteSettled("c1", 11); // re-settle re-arms from now
    fake.advance(COMPLETION_QUIET_PERIOD_MS - 1); // total ~2x period - 2s
    expect(fired).toHaveLength(0);
    fake.advance(1);
    expect(fired).toEqual([11]);
  });

  it("stop() clears all pending timers", async () => {
    const fake = makeFakeClock();
    const fired: string[] = [];
    const quiet = makeChildCompletionQuiet({
      clock: fake.clock,
      onQuiet: async (child) => {
        fired.push(child);
      },
    });
    quiet.noteSettled("c1", 1);
    quiet.noteSettled("c2", 2);
    quiet.stop();
    fake.advance(COMPLETION_QUIET_PERIOD_MS * 3);
    expect(fired).toHaveLength(0);
  });

  it("tracks children independently", async () => {
    const fake = makeFakeClock();
    const fired: string[] = [];
    const quiet = makeChildCompletionQuiet({
      clock: fake.clock,
      onQuiet: async (child) => {
        fired.push(child);
      },
    });
    quiet.noteSettled("c1", 1);
    quiet.noteSettled("c2", 2);
    fake.advance(COMPLETION_QUIET_PERIOD_MS);
    expect(fired).toEqual(["c1", "c2"]);
    // Resuming c2 after the period does not re-fire c1.
    quiet.noteResumed("c2");
    quiet.noteSettled("c1", 3);
    fake.advance(COMPLETION_QUIET_PERIOD_MS);
    expect(fired).toEqual(["c1", "c2", "c1"]);
  });
});
