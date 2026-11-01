import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  awaitCredentialRefresh,
  type CredentialRefreshState,
} from "./t3team-credentialRefreshFlow.ts";

afterEach(() => vi.useRealTimers());

const script = (states: ReadonlyArray<CredentialRefreshState | "throw">) => {
  let calls = 0;
  const poll = async () => {
    const next = states[Math.min(calls, states.length - 1)];
    calls += 1;
    if (next === "throw") throw new Error("offline");
    return next as CredentialRefreshState;
  };
  return { poll, calls: () => calls };
};

describe("awaitCredentialRefresh", () => {
  it("asks every interval while pending and stops at done", async () => {
    vi.useFakeTimers();
    const s = script(["pending", "pending", "done"]);
    const result = awaitCredentialRefresh({ poll: s.poll, signal: new AbortController().signal });
    await vi.advanceTimersByTimeAsync(9000);
    expect(await result).toBe("done");
    expect(s.calls()).toBe(3);
  });

  it("a failed ask ends the wait as failed", async () => {
    vi.useFakeTimers();
    const s = script(["throw"]);
    const result = awaitCredentialRefresh({ poll: s.poll, signal: new AbortController().signal });
    await vi.advanceTimersByTimeAsync(3000);
    expect(await result).toBe("failed");
  });

  it("stops asking once the card is gone", async () => {
    vi.useFakeTimers();
    const s = script(["pending"]);
    const controller = new AbortController();
    const result = awaitCredentialRefresh({ poll: s.poll, signal: controller.signal });
    await vi.advanceTimersByTimeAsync(3000);
    controller.abort();
    await vi.advanceTimersByTimeAsync(30000);
    expect(await result).toBe("aborted");
    expect(s.calls()).toBe(1);
  });
});
