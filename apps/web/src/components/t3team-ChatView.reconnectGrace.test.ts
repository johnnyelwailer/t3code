import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { scheduleEnvironmentReconnectWarning } from "./ChatView.logic";

// Upstream's default grace before a remote environment shows "reconnecting".
const REMOTE_GRACE_MS = 2_000;
const LOCAL_GRACE_MS = 30_000;

describe("environment reconnect warning grace (local backend)", () => {
  afterEach(() => vi.useRealTimers());

  it("honours a longer grace for the local backend", () => {
    vi.useFakeTimers();
    const showWarning = vi.fn();

    scheduleEnvironmentReconnectWarning(showWarning, LOCAL_GRACE_MS);
    vi.advanceTimersByTime(REMOTE_GRACE_MS);
    expect(showWarning).not.toHaveBeenCalled();

    vi.advanceTimersByTime(LOCAL_GRACE_MS - REMOTE_GRACE_MS);
    expect(showWarning).toHaveBeenCalledOnce();
  });
});
