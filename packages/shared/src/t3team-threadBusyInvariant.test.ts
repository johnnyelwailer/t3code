import { describe, expect, it } from "vite-plus/test";

import { isThreadBusyErrorMessage, THREAD_BUSY_FRAGMENT } from "./t3team-threadBusyInvariant.ts";

describe("isThreadBusyErrorMessage", () => {
  it("matches the decider's busy-thread invariant detail", () => {
    expect(isThreadBusyErrorMessage("Thread 't-1' already has a turn in progress.")).toBe(true);
  });

  it("matches the wrapped invariant message", () => {
    expect(
      isThreadBusyErrorMessage(
        "Orchestration command invariant failed (thread.turn.start): Thread 't-1' already has a turn in progress.",
      ),
    ).toBe(true);
  });

  it("rejects an unrelated message", () => {
    expect(isThreadBusyErrorMessage("Thread 't-1' does not exist.")).toBe(false);
  });

  it("rejects an empty message", () => {
    expect(isThreadBusyErrorMessage("")).toBe(false);
  });

  it("exports the fragment other modules pattern-match on", () => {
    expect(THREAD_BUSY_FRAGMENT).toBe("already has a turn in progress");
  });
});
