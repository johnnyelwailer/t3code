import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { createDelayedStatus, STATUS_SHOW_DELAY_MS, type ShownStatus } from "./delayedStatus.ts";

describe("createDelayedStatus caller timing", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("takes the show delay and hold from the caller when given", () => {
    const changes: Array<ShownStatus<string> | null> = [];
    const status = createDelayedStatus<string>((shown) => changes.push(shown), {
      showDelayMs: 600,
      minVisibleMs: 250,
    });
    status.update("a", "syncing");
    vi.advanceTimersByTime(STATUS_SHOW_DELAY_MS);
    expect(changes).toEqual([]);
    vi.advanceTimersByTime(600 - STATUS_SHOW_DELAY_MS);
    expect(changes).toEqual([{ key: "a", value: "syncing" }]);

    status.update("a", null);
    vi.advanceTimersByTime(249);
    expect(changes.at(-1)).toEqual({ key: "a", value: "syncing" });
    vi.advanceTimersByTime(1);
    expect(changes.at(-1)).toBeNull();
  });
});
