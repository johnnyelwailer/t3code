import { describe, expect, it } from "vite-plus/test";
import { buildActivityLabelContext, parseActivityLabel } from "./t3team-activityLabelContext.ts";
import {
  ACTIVITY_LABEL_TTL_MS,
  createActivityLabelEventReactor,
  createActivityLabelSummarizer,
} from "./t3team-activityLabelSummarizer.ts";

const model = { instanceId: "host", model: "current" } as never;

interface TimerHarness {
  fire: (index: number) => Promise<void>;
  delays: number[];
  setTimer: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  clearTimer: (timer: ReturnType<typeof setTimeout>) => void;
}

/** Manual timer capture: each setTimer records the delay and the callback.
 *  Handles are unique per timer so the TTL timer-handle race guard is
 *  exercised even when two timers share a delay. */
const makeTimers = (): TimerHarness => {
  const callbacks: Array<() => void> = [];
  const delays: number[] = [];
  return {
    delays,
    fire: async (index: number) => {
      await callbacks[index]!();
    },
    setTimer: (callback: () => void, delayMs: number) => {
      const handle = { token: delays.length };
      delays.push(delayMs);
      callbacks.push(callback);
      return handle as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimer: () => undefined,
  };
};

describe("activity label summarizer", () => {
  it("uses only the newest debounced generation", async () => {
    const timers = makeTimers();
    const persisted: Array<{ label: string | null }> = [];
    const summarizer = createActivityLabelSummarizer({
      generate: async ({ context }) => context.split("\n").at(-1)?.split(": ").at(-1) ?? "",
      persist: async ({ label }) => {
        persisted.push({ label });
      },
      isActive: () => true,
      onError: () => undefined,
      ...timers,
    });
    summarizer.note({
      threadId: "t1",
      modelSelection: model,
      kind: "tool.started",
      summary: "Reading contracts.ts",
    });
    summarizer.note({
      threadId: "t1",
      modelSelection: model,
      kind: "tool.completed",
      summary: "Editing contracts.ts",
    });
    await timers.fire(0);
    await timers.fire(1);
    expect(persisted).toEqual([{ label: "Editing contracts.ts" }]);
  });

  it("skips generation when the recent-activity window is unchanged", async () => {
    const timers = makeTimers();
    let generations = 0;
    const summarizer = createActivityLabelSummarizer({
      generate: async () => {
        generations += 1;
        return "Reading contracts";
      },
      persist: async () => undefined,
      isActive: () => true,
      onError: () => undefined,
      ...timers,
    });
    summarizer.note({
      threadId: "t1",
      modelSelection: model,
      kind: "tool.started",
      summary: "Reading contracts.ts",
    });
    await timers.fire(0);
    expect(generations).toBe(1);
    // Identical window again — the hash matches the last generated one: no new
    // generation timer. (Timers: 0 = first debounce, 1 = the 5s TTL clear
    // scheduled after the persist; the second note adds neither.)
    summarizer.note({
      threadId: "t1",
      modelSelection: model,
      kind: "tool.started",
      summary: "Reading contracts.ts",
    });
    expect(timers.delays.length).toBe(2);
    expect(generations).toBe(1);
  });

  it("regenerates immediately when the coarse activity state changes", async () => {
    const timers = makeTimers();
    const summarizer = createActivityLabelSummarizer({
      generate: async () => "Running tests",
      persist: async () => undefined,
      isActive: () => true,
      onError: () => undefined,
      ...timers,
    });
    summarizer.note({
      threadId: "t1",
      modelSelection: model,
      kind: "tool.started",
      summary: "Reading contracts.ts",
      activityState: "working",
    });
    summarizer.note({
      threadId: "t1",
      modelSelection: model,
      kind: "tool.started",
      summary: "Editing contracts.ts",
      activityState: "writing",
    });
    // First note waits out the default debounce; the coarse state change
    // (working → writing, the only immediate trigger in GHE #208) fires now.
    expect(timers.delays).toEqual([20_000, 0]);
    await timers.fire(1);
  });

  it("throttles: state changes within the minimum cadence defer into the remaining window", async () => {
    let nowMs = 0;
    const timers = makeTimers();
    const summarizer = createActivityLabelSummarizer({
      generate: async () => "Running tests",
      persist: async () => undefined,
      isActive: () => true,
      onError: () => undefined,
      now: () => nowMs,
      ...timers,
    });
    summarizer.note({
      threadId: "t1",
      modelSelection: model,
      kind: "tool.started",
      summary: "Reading contracts.ts",
      activityState: "working",
    });
    await timers.fire(0); // generation persists at t=0
    // t=10s: a new window + state change would regenerate immediately pre-#208;
    // now it defers to 60s minus the 10s already elapsed.
    nowMs = 10_000;
    summarizer.note({
      threadId: "t1",
      modelSelection: model,
      kind: "tool.started",
      summary: "Editing contracts.ts",
      activityState: "writing",
    });
    expect(timers.delays).toEqual([20_000, ACTIVITY_LABEL_TTL_MS, 50_000]);
    // Entry 1 is the 5s TTL clear scheduled after the first persist; the
    // deferred generation is entry 2.
    await timers.fire(2);
  });

  it("regenerates on a new activity kind class only after the debounce (no per-event flush)", async () => {
    const timers = makeTimers();
    const summarizer = createActivityLabelSummarizer({
      generate: async () => "Running tests",
      persist: async () => undefined,
      isActive: () => true,
      onError: () => undefined,
      ...timers,
    });
    summarizer.note({
      threadId: "t1",
      modelSelection: model,
      kind: "tool.started",
      summary: "Reading contracts.ts",
    });
    summarizer.note({
      threadId: "t1",
      modelSelection: model,
      kind: "execute.started",
      summary: "npm test",
    });
    // GHE #208: a kind-class change alone no longer flushes the LLM detail;
    // only a coarse state change does. Both notes wait out the debounce.
    expect(timers.delays).toEqual([20_000, 20_000]);
    await timers.fire(1);
  });

  it("is a no-op when the flag turns off before the debounce fires", async () => {
    let active = true;
    const timers = makeTimers();
    let generations = 0;
    const summarizer = createActivityLabelSummarizer({
      generate: async () => {
        generations += 1;
        return "Reading contracts";
      },
      persist: async () => undefined,
      isActive: () => active,
      onError: () => undefined,
      ...timers,
    });
    summarizer.note({
      threadId: "t1",
      modelSelection: model,
      kind: "tool.started",
      summary: "Reading contracts.ts",
    });
    active = false; // flag toggled off before the debounce fired
    await timers.fire(0);
    expect(generations).toBe(0);
  });

  it("clears pending work, persists a null label, and never writes a stale generation", async () => {
    const timers = makeTimers();
    let started = false;
    let gateResolve: () => void;
    const gate = new Promise<void>((resolve) => {
      gateResolve = resolve;
    });
    const persisted: Array<{ label: string | null; generation: number }> = [];
    const summarizer = createActivityLabelSummarizer({
      generate: async () => {
        started = true;
        await gate;
        return "Reading contracts";
      },
      persist: async ({ label, generation }) => {
        persisted.push({ label, generation });
      },
      isActive: () => true,
      onError: () => undefined,
      ...timers,
    });
    summarizer.note({
      threadId: "t1",
      modelSelection: model,
      kind: "tool.started",
      summary: "Reading contracts.ts",
    });
    timers.fire(0); // start the generation without awaiting it
    await summarizer.clear("t1"); // thread went idle mid-generation
    gateResolve!();
    // Let the stale generation's microtask continuation finish: it must not persist.
    await new Promise((resolve) => queueMicrotask(resolve));
    await new Promise((resolve) => queueMicrotask(resolve));
    expect(started).toBe(true);
    // clear() supersedes the in-flight generation (note=1, clear=2) and persists the null.
    expect(persisted).toEqual([{ label: null, generation: 2 }]);
  });

  it("fails open: a rejected generation persists nothing and reports the cause", async () => {
    const timers = makeTimers();
    let observed: unknown;
    const summarizer = createActivityLabelSummarizer({
      generate: async () => {
        throw new Error("gateway down");
      },
      persist: async () => undefined,
      isActive: () => true,
      onError: (cause) => {
        observed = cause;
      },
      ...timers,
    });
    summarizer.note({
      threadId: "t1",
      modelSelection: model,
      kind: "tool.started",
      summary: "Reading contracts.ts",
    });
    await timers.fire(0);
    expect(observed).toBeInstanceOf(Error);
  });

  it("time-boxes a persisted label: schedules a TTL clear and clears it when it fires", async () => {
    const timers = makeTimers();
    const persisted: Array<{ label: string | null }> = [];
    const summarizer = createActivityLabelSummarizer({
      generate: async () => "Reading contracts",
      persist: async ({ label }) => {
        persisted.push({ label });
      },
      isActive: () => true,
      onError: () => undefined,
      ...timers,
    });
    summarizer.note({
      threadId: "t1",
      modelSelection: model,
      kind: "tool.started",
      summary: "Reading contracts.ts",
    });
    await timers.fire(0); // generation persists the label
    // The debounce timer (index 0) plus a 5s TTL timer (index 1).
    expect(timers.delays).toEqual([20_000, ACTIVITY_LABEL_TTL_MS]);
    await timers.fire(1); // TTL elapses: the stored label is cleared.
    expect(persisted).toEqual([{ label: "Reading contracts" }, { label: null }]);
  });

  it("a second label before expiry reschedules the TTL; the first label is not cleared late", async () => {
    const timers = makeTimers();
    const persisted: Array<{ label: string | null }> = [];
    const summarizer = createActivityLabelSummarizer({
      generate: async ({ context }) => context.split("\n").at(-1)?.split(": ").at(-1) ?? "",
      persist: async ({ label }) => {
        persisted.push({ label });
      },
      isActive: () => true,
      onError: () => undefined,
      minRegenerateMs: 0, // allow the second generation without the 60s cadence
      ...timers,
    });
    summarizer.note({
      threadId: "t1",
      modelSelection: model,
      kind: "tool.started",
      summary: "Reading contracts.ts",
    });
    await timers.fire(0); // label A persists; TTL #1 = timer index 1
    summarizer.note({
      threadId: "t1",
      modelSelection: model,
      kind: "tool.started",
      summary: "Editing contracts.ts",
    });
    await timers.fire(2); // label B persists; TTL #2 = timer index 3 (replaces #1)
    expect(persisted).toEqual([
      { label: "Reading contracts.ts" },
      { label: "Editing contracts.ts" },
    ]);
    // Late fire of TTL #1: label B has rescheduled its own timer, so the
    // handle guard must no-op — B is NOT cleared by A's stale timer.
    await timers.fire(1);
    expect(persisted).toEqual([
      { label: "Reading contracts.ts" },
      { label: "Editing contracts.ts" },
    ]);
    // B's own TTL elapses: it clears B, not A.
    await timers.fire(3);
    expect(persisted).toEqual([
      { label: "Reading contracts.ts" },
      { label: "Editing contracts.ts" },
      { label: null },
    ]);
  });

  it("a late note does not extend the current label: its TTL still clears it", async () => {
    let nowMs = 0;
    const timers = makeTimers();
    const persisted: Array<{ label: string | null }> = [];
    const summarizer = createActivityLabelSummarizer({
      generate: async ({ context }) => context.split("\n").at(-1)?.split(": ").at(-1) ?? "",
      persist: async ({ label }) => {
        persisted.push({ label });
      },
      isActive: () => true,
      onError: () => undefined,
      now: () => nowMs,
      minRegenerateMs: 60_000,
      ...timers,
    });
    summarizer.note({
      threadId: "t1",
      modelSelection: model,
      kind: "tool.started",
      summary: "Reading contracts.ts",
    });
    await timers.fire(0); // label A persists; TTL #1 = timer index 1
    nowMs += 2_000; // 2s into A's life
    summarizer.note({
      threadId: "t1",
      modelSelection: model,
      kind: "tool.started",
      summary: "Editing contracts.ts",
    });
    // The next generation is deferred by the cadence (index 2, ~58s), but a
    // note does NOT extend the current label's minimum life: TTL #1 still fires.
    await timers.fire(1);
    expect(persisted).toEqual([{ label: "Reading contracts.ts" }, { label: null }]);
    // The deferred generation later persists a fresh label B.
    await timers.fire(2);
    expect(persisted.at(-1)).toEqual({ label: "Editing contracts.ts" });
  });

  it("turn-end clear cancels the pending TTL: no late null after the clear", async () => {
    const timers = makeTimers();
    const persisted: Array<{ label: string | null }> = [];
    const summarizer = createActivityLabelSummarizer({
      generate: async () => "Reading contracts",
      persist: async ({ label }) => {
        persisted.push({ label });
      },
      isActive: () => true,
      onError: () => undefined,
      ...timers,
    });
    summarizer.note({
      threadId: "t1",
      modelSelection: model,
      kind: "tool.started",
      summary: "Reading contracts.ts",
    });
    await timers.fire(0); // label persists; TTL = timer index 1
    await summarizer.clear("t1"); // turn ended
    expect(persisted).toEqual([{ label: "Reading contracts" }, { label: null }]);
    await timers.fire(1); // late TTL — the entry is gone, must be a no-op
    expect(persisted.length).toBe(2);
  });

  it("schedules no TTL timer when the flag is off", async () => {
    const timers = makeTimers();
    const persisted: Array<{ label: string | null }> = [];
    const summarizer = createActivityLabelSummarizer({
      generate: async () => "Reading contracts",
      persist: async ({ label }) => {
        persisted.push({ label });
      },
      isActive: () => false, // enrichment off: no generation, no TTL
      onError: () => undefined,
      ...timers,
    });
    summarizer.note({
      threadId: "t1",
      modelSelection: model,
      kind: "tool.started",
      summary: "Reading contracts.ts",
    });
    await timers.fire(0); // generation is skipped
    expect(persisted).toEqual([]);
    // Only the debounce timer was ever scheduled — no 5s TTL follow-on.
    expect(timers.delays).toEqual([20_000]);
  });

  it("honors a custom TTL and treats 0 as 'no timer'", async () => {
    const timers = makeTimers();
    const persisted: Array<{ label: string | null }> = [];
    const summarizer = createActivityLabelSummarizer({
      generate: async () => "Reading contracts",
      persist: async ({ label }) => {
        persisted.push({ label });
      },
      isActive: () => true,
      onError: () => undefined,
      activityLabelTtlMs: 0, // disabled: label lives until the next generation
      ...timers,
    });
    summarizer.note({
      threadId: "t1",
      modelSelection: model,
      kind: "tool.started",
      summary: "Reading contracts.ts",
    });
    await timers.fire(0);
    expect(persisted).toEqual([{ label: "Reading contracts" }]);
    expect(timers.delays).toEqual([20_000]);
  });

  it("caps the context payload at 400 chars no matter the input", () => {
    const window = Array.from({ length: 5 }, (_, index) => ({
      kind: "tool.started",
      summary: `${"x".repeat(300)}-${index}`,
    }));
    const context = buildActivityLabelContext(
      window,
      "a very long user intent that must also be capped",
    );
    expect(context.length).toBeLessThanOrEqual(400);
  });

  it("validates generated labels: compact phrase only", () => {
    expect(parseActivityLabel("Reading contracts")).toBe("Reading contracts");
    expect(parseActivityLabel('"Running tests."')).toBe("Running tests");
    expect(
      parseActivityLabel("Fixing auth bug and also rewriting the entire dependency graph"),
    ).toBe(null);
    expect(parseActivityLabel("")).toBe(null);
    expect(parseActivityLabel(42)).toBe(null);
  });

  it("runs a fake provider from an activity event and never writes chat/messages", async () => {
    const timers = makeTimers();
    const persisted: Array<{ threadId: string; label: string | null }> = [];
    let modelCalls = 0;
    const reactor = createActivityLabelEventReactor({
      loadThread: async (threadId) =>
        threadId === "t1" ? { modelSelection: model, userGist: "fix the build" } : null,
      generate: async () => {
        modelCalls += 1;
        return "Fixing build";
      },
      persist: async ({ threadId, label }) => {
        persisted.push({ threadId, label });
      },
      isActive: () => true,
      onError: () => undefined,
      ...timers,
    });
    await reactor.handle({ threadId: "t1", kind: "tool.started", summary: "npm run build" });
    await reactor.handle({ threadId: "unknown", kind: "tool.started", summary: "ignored" });
    await timers.fire(0);
    await reactor.clear("t1");
    expect(modelCalls).toBe(1);
    expect(persisted).toEqual([
      { threadId: "t1", label: "Fixing build" },
      { threadId: "t1", label: null },
    ]);
  });
});
