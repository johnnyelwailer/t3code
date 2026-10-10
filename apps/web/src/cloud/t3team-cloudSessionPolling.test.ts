import { describe, expect, it, vi } from "vite-plus/test";

import {
  CLOUD_SESSION_IDLE_REFRESH_INTERVAL_MS,
  CLOUD_SESSION_MIN_REFRESH_GAP_MS,
  cloudSessionPollIntervalMs,
  createRefreshGate,
  startCloudSessionListPolling,
} from "./t3team-cloudSessionPolling";

describe("startCloudSessionListPolling", () => {
  it("refreshes immediately on open, then on every interval until stopped", () => {
    vi.useFakeTimers();
    try {
      const refresh = vi.fn();
      const stop = startCloudSessionListPolling(refresh, 5000);

      expect(refresh).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(5000);
      expect(refresh).toHaveBeenCalledTimes(2);
      vi.advanceTimersByTime(10_000);
      expect(refresh).toHaveBeenCalledTimes(4);

      stop();
      vi.advanceTimersByTime(30_000);
      expect(refresh).toHaveBeenCalledTimes(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it("releases its timer when stopped and keeps the closed menu silent", () => {
    vi.useFakeTimers();
    try {
      const refresh = vi.fn();
      const stop = startCloudSessionListPolling(refresh, 5000);
      expect(vi.getTimerCount()).toBe(1);

      stop();
      stop(); // closing twice (menu blur, then unmount) must not throw
      expect(vi.getTimerCount()).toBe(0);
      vi.advanceTimersByTime(60_000);
      expect(refresh).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("polls nothing while the window is hidden and refreshes once on return", () => {
    vi.useFakeTimers();
    try {
      let hidden = false;
      let notify = () => {};
      const visibility = {
        isHidden: () => hidden,
        subscribe: (onChange: () => void) => {
          notify = onChange;
          return () => {
            notify = () => {};
          };
        },
      };
      const refresh = vi.fn();
      const stop = startCloudSessionListPolling(refresh, 5000, visibility);
      expect(refresh).toHaveBeenCalledTimes(1);

      hidden = true;
      notify();
      expect(vi.getTimerCount()).toBe(0);
      vi.advanceTimersByTime(60_000);
      expect(refresh).toHaveBeenCalledTimes(1);

      hidden = false;
      notify();
      expect(refresh).toHaveBeenCalledTimes(2);
      vi.advanceTimersByTime(5000);
      expect(refresh).toHaveBeenCalledTimes(3);

      stop();
      notify();
      vi.advanceTimersByTime(60_000);
      expect(refresh).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("cloudSessionPollIntervalMs", () => {
  it("polls at the busy cadence only while a session is provisioning", () => {
    expect(cloudSessionPollIntervalMs([{ phase: "preparing" }, { phase: "ready" }], 5000)).toBe(
      5000,
    );
    expect(cloudSessionPollIntervalMs([{ phase: "ready" }, { phase: "failed" }], 5000)).toBe(
      CLOUD_SESSION_IDLE_REFRESH_INTERVAL_MS,
    );
    expect(cloudSessionPollIntervalMs([], 5000)).toBe(CLOUD_SESSION_IDLE_REFRESH_INTERVAL_MS);
    expect(CLOUD_SESSION_IDLE_REFRESH_INTERVAL_MS).toBeGreaterThanOrEqual(30_000);
    expect(CLOUD_SESSION_IDLE_REFRESH_INTERVAL_MS).toBeLessThanOrEqual(60_000);
  });

  it("never lets the busy cadence drop below the shared floor", () => {
    expect(cloudSessionPollIntervalMs([{ phase: "queued" }], 1000)).toBe(
      CLOUD_SESSION_MIN_REFRESH_GAP_MS,
    );
  });

  it("backs an idle list off to one refresh per idle interval", () => {
    vi.useFakeTimers();
    try {
      const refresh = vi.fn();
      const stop = startCloudSessionListPolling(
        refresh,
        cloudSessionPollIntervalMs([{ phase: "ready" }], 5000),
      );
      expect(refresh).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(CLOUD_SESSION_IDLE_REFRESH_INTERVAL_MS - 1);
      // No 5 s ticks while nothing is provisioning.
      expect(refresh).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(1);
      expect(refresh).toHaveBeenCalledTimes(2);
      stop();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("createRefreshGate", () => {
  it("never lets one key refresh more often than the minimum gap", () => {
    let now = 0;
    const acquire = createRefreshGate(CLOUD_SESSION_MIN_REFRESH_GAP_MS, () => now);

    expect(acquire("env-1")).toBe(true);
    now = 1000; // a post-create refresh right after a poll tick
    expect(acquire("env-1")).toBe(false);
    expect(acquire("env-2")).toBe(true); // other environments keep their own gap
    now = 4999;
    expect(acquire("env-1")).toBe(false);
    now = 5000;
    expect(acquire("env-1")).toBe(true);
    now = 9000;
    expect(acquire("env-1")).toBe(false);
  });

  it("holds the shared list gate at five seconds or more", () => {
    expect(CLOUD_SESSION_MIN_REFRESH_GAP_MS).toBeGreaterThanOrEqual(5000);
  });
});
