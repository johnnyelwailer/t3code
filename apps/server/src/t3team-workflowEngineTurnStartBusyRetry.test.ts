import { describe, expect, it } from "vite-plus/test";

import {
  dispatchThreadTurnStartWithRetry,
  isThreadTurnStartBusyRejection,
} from "./t3team-workflowEngineTurnStartBusyRetry.ts";

function busyRejection(threadId = "t-1"): unknown {
  return {
    _tag: "OrchestrationCommandInvariantError",
    commandType: "thread.turn.start",
    detail: `Thread '${threadId}' already has a turn in progress.`,
  };
}

const enqueue = (fn: () => Promise<void>): Promise<void> => fn();
const noDelay = async () => {};

describe("isThreadTurnStartBusyRejection", () => {
  it("matches the decider's busy-thread invariant", () => {
    expect(isThreadTurnStartBusyRejection(busyRejection())).toBe(true);
  });

  it("rejects a different invariant detail", () => {
    expect(
      isThreadTurnStartBusyRejection({
        _tag: "OrchestrationCommandInvariantError",
        detail: "Thread 't-1' does not exist.",
      }),
    ).toBe(false);
  });

  it("rejects a different error tag", () => {
    expect(
      isThreadTurnStartBusyRejection({
        _tag: "OrchestrationCommandIdConflictError",
        detail: "already has a turn in progress",
      }),
    ).toBe(false);
  });

  it("rejects non-object errors", () => {
    expect(isThreadTurnStartBusyRejection("boom")).toBe(false);
    expect(isThreadTurnStartBusyRejection(undefined)).toBe(false);
  });
});

describe("dispatchThreadTurnStartWithRetry", () => {
  it("retries a busy rejection and succeeds once the thread frees up", async () => {
    let calls = 0;
    const delays: number[] = [];
    await dispatchThreadTurnStartWithRetry(
      enqueue,
      async () => {
        calls += 1;
        if (calls < 3) throw busyRejection();
      },
      async (ms) => {
        delays.push(ms);
      },
    );
    expect(calls).toBe(3);
    expect(delays).toEqual([5_000, 30_000]);
  });

  it("fails the run once the retry budget is exhausted", async () => {
    let calls = 0;
    await expect(
      dispatchThreadTurnStartWithRetry(
        enqueue,
        async () => {
          calls += 1;
          throw busyRejection();
        },
        noDelay,
      ),
    ).rejects.toMatchObject({ detail: "Thread 't-1' already has a turn in progress." });
    // 1 initial attempt + MAX_INTERRUPTED_TURN_REDRIVES (3) retries.
    expect(calls).toBe(4);
  });

  it("propagates a non-busy rejection immediately, without retrying", async () => {
    let calls = 0;
    const error = {
      _tag: "OrchestrationCommandInvariantError",
      detail: "Thread 't-1' does not exist.",
    };
    await expect(
      dispatchThreadTurnStartWithRetry(
        enqueue,
        async () => {
          calls += 1;
          throw error;
        },
        noDelay,
      ),
    ).rejects.toBe(error);
    expect(calls).toBe(1);
  });

  it("resolves on the first try when the thread is free", async () => {
    let calls = 0;
    await dispatchThreadTurnStartWithRetry(
      enqueue,
      async () => {
        calls += 1;
      },
      noDelay,
    );
    expect(calls).toBe(1);
  });
});
