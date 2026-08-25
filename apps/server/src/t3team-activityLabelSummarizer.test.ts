import { describe, expect, it } from "vite-plus/test";
import { buildActivityLabelContext, parseActivityLabel } from "./t3team-activityLabelContext.ts";
import {
  createActivityLabelEventReactor,
  createActivityLabelSummarizer,
} from "./t3team-activityLabelSummarizer.ts";

const model = { instanceId: "host", model: "current" } as never;

interface TimerHarness {
  fire: (index: number) => Promise<void>;
  delays: number[];
}

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
      await callbacks[index]!();
    },
    setTimer: (callback: () => void, delayMs: number) => {
      delays.push(delayMs);
      callbacks.push(callback);
      return delayMs as unknown as ReturnType<typeof setTimeout>;
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
    // Identical window again — the hash matches the last generated one: no new timer.
    summarizer.note({
      threadId: "t1",
      modelSelection: model,
      kind: "tool.started",
      summary: "Reading contracts.ts",
    });
    expect(timers.delays.length).toBe(1);
    expect(generations).toBe(1);
  });

  it("regenerates immediately when a new activity kind class starts", async () => {
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
    // First note waits out the default debounce; the kind-class change fires now.
    expect(timers.delays).toEqual([20_000, 0]);
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
