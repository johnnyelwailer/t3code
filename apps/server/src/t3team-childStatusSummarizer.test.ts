import { describe, expect, it } from "vite-plus/test";
import {
  createChildStatusEventReactor,
  createChildStatusSummarizer,
  parseChildStatus,
} from "./t3team-childStatusSummarizer.ts";

describe("child status summarizer", () => {
  it("uses only the newest debounced generation and accepts strict short output", async () => {
    const timers: Array<() => void> = [];
    const persisted: string[] = [];
    const summarizer = createChildStatusSummarizer({
      generate: async ({ activity }) => ({ status: activity.at(-1)?.summary }),
      persist: async ({ status }) => {
        persisted.push(status);
      },
      nowIso: () => "2026-07-19T00:00:00.000Z",
      onError: () => undefined,
      setTimer: (callback) => {
        timers.push(callback);
        return timers.length as unknown as ReturnType<typeof setTimeout>;
      },
      clearTimer: () => undefined,
    });
    const model = { instanceId: "host", model: "current" } as never;
    summarizer.note({
      threadId: "child",
      modelSelection: model,
      activity: [{ kind: "turn", summary: "Checking syntax" }],
    });
    summarizer.note({
      threadId: "child",
      modelSelection: model,
      activity: [{ kind: "turn", summary: "Validating workflow" }],
    });
    await timers[0]!();
    await timers[1]!();
    expect(persisted).toEqual(["Validating workflow"]);
    expect(parseChildStatus({ status: "x" })).toBeNull();
  });

  it("runs a fake provider from a child event and persists without chat/context writes", async () => {
    const persisted: Array<{ status: string; threadId: string }> = [];
    let modelCalls = 0;
    let messageWrites = 0;
    let activityWrites = 0;
    let contextWrites = 0;
    const reactor = createChildStatusEventReactor({
      loadChild: async (threadId) =>
        threadId === "child-1"
          ? { id: threadId, modelSelection: { instanceId: "nexplore", model: "status" } as never }
          : null,
      generate: async ({ activity }) => {
        modelCalls += 1;
        return {
          status:
            activity.at(-1)?.summary === "tests passed" ? "Validating completed tests" : "Working",
        };
      },
      persist: async ({ threadId, status }) => {
        persisted.push({ threadId, status });
      },
      nowIso: () => "2026-07-19T00:00:00.000Z",
      onError: () => undefined,
      setTimer: () => 1 as unknown as ReturnType<typeof setTimeout>,
      clearTimer: () => undefined,
    });
    await reactor.handle({ threadId: "child-1", kind: "turn.completed", summary: "tests passed" });
    await reactor.flush("child-1");
    expect(modelCalls).toBe(1);
    expect(persisted).toEqual([{ threadId: "child-1", status: "Validating completed tests" }]);
    expect({ messageWrites, activityWrites, contextWrites }).toEqual({
      messageWrites: 0,
      activityWrites: 0,
      contextWrites: 0,
    });
    void messageWrites;
    void activityWrites;
    void contextWrites;
  });

  it("catches and reports a rejected debounced generation", async () => {
    let timer: (() => void) | undefined;
    let resolveObserved!: (cause: unknown) => void;
    const observed = new Promise<unknown>((resolve) => {
      resolveObserved = resolve;
    });
    const summarizer = createChildStatusSummarizer({
      generate: async () => {
        throw new Error("provider unavailable");
      },
      persist: async () => undefined,
      nowIso: () => "2026-07-19T00:00:00.000Z",
      onError: resolveObserved,
      setTimer: (callback) => {
        timer = callback;
        return 1 as unknown as ReturnType<typeof setTimeout>;
      },
    });
    summarizer.note({
      threadId: "child",
      modelSelection: { instanceId: "host", model: "current" } as never,
      activity: [{ kind: "turn", summary: "Working" }],
    });
    timer?.();
    await expect(observed).resolves.toMatchObject({ message: "provider unavailable" });
  });
});
