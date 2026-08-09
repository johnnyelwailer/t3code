import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { pollAtlassianOAuthFlowStatus } from "./t3team-atlassianOAuthStatusPoll";
import type { AtlassianOAuthFlowStatus } from "~/t3team/hooks/t3team-atlassianOAuthServerFlow";

const DEADLINE_MS = Date.now() + 5 * 60_000;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("pollAtlassianOAuthFlowStatus", () => {
  it("resolves server_connected the moment the server reports completed", async () => {
    const getStatus = vi.fn<(state: string) => Promise<AtlassianOAuthFlowStatus>>(
      async () => "completed",
    );

    const result = pollAtlassianOAuthFlowStatus({
      getServerState: () => "state-1",
      getStatus,
      deadlineMs: DEADLINE_MS,
      isCancelled: () => false,
      onLinkExpired: vi.fn(),
    });

    await vi.advanceTimersByTimeAsync(2_000);

    await expect(result).resolves.toEqual({ kind: "server_connected" });
    expect(getStatus).toHaveBeenCalledWith("state-1");
  });

  it("reports expired only after seeing pending, and keeps waiting instead of ending the race", async () => {
    let status: AtlassianOAuthFlowStatus = "pending";
    const onLinkExpired = vi.fn();

    void pollAtlassianOAuthFlowStatus({
      getServerState: () => "state-1",
      getStatus: async () => status,
      deadlineMs: DEADLINE_MS,
      isCancelled: () => false,
      onLinkExpired,
    });

    await vi.advanceTimersByTimeAsync(2_000);
    expect(onLinkExpired).not.toHaveBeenCalled();

    status = "unknown";
    await vi.advanceTimersByTimeAsync(2_000);
    expect(onLinkExpired).toHaveBeenCalledTimes(1);

    // Expiry does not settle the poll by itself: it keeps watching until cancelled or the deadline.
    await vi.advanceTimersByTimeAsync(2_000);
    expect(onLinkExpired).toHaveBeenCalledTimes(1);
  });

  it("never reports expired for a state that was always unknown, only for one seen pending first", async () => {
    const onLinkExpired = vi.fn();

    void pollAtlassianOAuthFlowStatus({
      getServerState: () => "never-issued",
      getStatus: async () => "unknown",
      deadlineMs: DEADLINE_MS,
      isCancelled: () => false,
      onLinkExpired,
    });

    await vi.advanceTimersByTimeAsync(6_000);

    expect(onLinkExpired).not.toHaveBeenCalled();
  });

  it("follows a fresh state minted mid-wait instead of the one it started on", async () => {
    let currentState = "state-1";
    const seenStates: string[] = [];

    const result = pollAtlassianOAuthFlowStatus({
      getServerState: () => currentState,
      getStatus: async (state) => {
        seenStates.push(state);
        if (state === "state-2") return "completed";
        return "pending";
      },
      deadlineMs: DEADLINE_MS,
      isCancelled: () => false,
      onLinkExpired: vi.fn(),
    });

    await vi.advanceTimersByTimeAsync(2_000);
    expect(seenStates).toEqual(["state-1"]);

    // Copying the sign-in link again mints a new flow and swaps the target the poll follows.
    currentState = "state-2";
    await vi.advanceTimersByTimeAsync(2_000);

    await expect(result).resolves.toEqual({ kind: "server_connected" });
    expect(seenStates).toEqual(["state-1", "state-2"]);
  });

  it("stops polling once cancelled instead of running to the deadline", async () => {
    let cancelled = false;
    const getStatus = vi.fn<(state: string) => Promise<AtlassianOAuthFlowStatus>>(
      async () => "pending",
    );

    const result = pollAtlassianOAuthFlowStatus({
      getServerState: () => "state-1",
      getStatus,
      deadlineMs: DEADLINE_MS,
      isCancelled: () => cancelled,
      onLinkExpired: vi.fn(),
    });

    await vi.advanceTimersByTimeAsync(2_000);
    expect(getStatus).toHaveBeenCalledTimes(1);

    cancelled = true;
    await vi.advanceTimersByTimeAsync(10_000);

    await expect(result).resolves.toEqual({ kind: "timed_out" });
    // No further polls after cancellation, even though several intervals elapsed.
    expect(getStatus).toHaveBeenCalledTimes(1);
  });
});
