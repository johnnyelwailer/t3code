import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { USER_IDLE_AFTER_MS } from "~/hooks/t3team-userActivity";
import {
  ATLASSIAN_RESOURCES_CACHE_MAX_AGE_MS,
  ATLASSIAN_RESOURCES_POLL_INTERVAL_MS,
  computeNextPollDelayMs,
  GITHUB_ACTIVITY_CACHE_MAX_AGE_MS,
  GITHUB_ACTIVITY_POLL_INTERVAL_MS,
  isPollingOnline,
  isPollingVisible,
  startBrowserPolling,
} from "./t3team-integrationPolling";

describe("t3team integration polling", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("polls immediately when no cache timestamp exists", () => {
    expect(
      computeNextPollDelayMs({
        enabled: true,
        intervalMs: GITHUB_ACTIVITY_POLL_INTERVAL_MS,
        maxAgeMs: GITHUB_ACTIVITY_CACHE_MAX_AGE_MS,
        nowMs: 10_000,
        isVisible: true,
        isOnline: true,
      }),
    ).toBe(0);
  });

  it("polls immediately when the cache is stale", () => {
    expect(
      computeNextPollDelayMs({
        enabled: true,
        intervalMs: ATLASSIAN_RESOURCES_POLL_INTERVAL_MS,
        maxAgeMs: ATLASSIAN_RESOURCES_CACHE_MAX_AGE_MS,
        updatedAt: 1_000,
        nowMs: 1_000 + ATLASSIAN_RESOURCES_CACHE_MAX_AGE_MS,
        isVisible: true,
        isOnline: true,
      }),
    ).toBe(0);
  });

  it("waits until the shorter of poll interval and remaining freshness window", () => {
    expect(
      computeNextPollDelayMs({
        enabled: true,
        intervalMs: 60_000,
        maxAgeMs: 90_000,
        updatedAt: 10_000,
        nowMs: 40_000,
        isVisible: true,
        isOnline: true,
      }),
    ).toBe(60_000);

    expect(
      computeNextPollDelayMs({
        enabled: true,
        intervalMs: 60_000,
        maxAgeMs: 90_000,
        updatedAt: 10_000,
        nowMs: 70_000,
        isVisible: true,
        isOnline: true,
      }),
    ).toBe(30_000);
  });

  it("does not poll when disabled", () => {
    expect(
      computeNextPollDelayMs({
        enabled: false,
        intervalMs: GITHUB_ACTIVITY_POLL_INTERVAL_MS,
        maxAgeMs: GITHUB_ACTIVITY_CACHE_MAX_AGE_MS,
        updatedAt: 1_000,
        nowMs: 2_000,
        isVisible: true,
        isOnline: true,
      }),
    ).toBeNull();
  });

  it("does not poll while hidden or offline", () => {
    expect(
      computeNextPollDelayMs({
        enabled: true,
        intervalMs: GITHUB_ACTIVITY_POLL_INTERVAL_MS,
        maxAgeMs: GITHUB_ACTIVITY_CACHE_MAX_AGE_MS,
        updatedAt: 1_000,
        nowMs: 2_000,
        isVisible: false,
        isOnline: true,
      }),
    ).toBeNull();

    expect(
      computeNextPollDelayMs({
        enabled: true,
        intervalMs: GITHUB_ACTIVITY_POLL_INTERVAL_MS,
        maxAgeMs: GITHUB_ACTIVITY_CACHE_MAX_AGE_MS,
        updatedAt: 1_000,
        nowMs: 2_000,
        isVisible: true,
        isOnline: false,
      }),
    ).toBeNull();
  });

  it("treats missing document and navigator as visible and online", () => {
    expect(isPollingVisible()).toBe(true);
    expect(isPollingOnline()).toBe(true);
  });

  it("backs off when a poll attempt does not refresh cache freshness", async () => {
    vi.useFakeTimers();

    let updatedAt: number | undefined;
    let attempt = 0;
    const poll = vi.fn(async () => {
      attempt += 1;
      if (attempt === 2) {
        updatedAt = Date.now();
      }
    });
    const poller = startBrowserPolling({
      enabled: true,
      intervalMs: GITHUB_ACTIVITY_POLL_INTERVAL_MS,
      maxAgeMs: GITHUB_ACTIVITY_CACHE_MAX_AGE_MS,
      getUpdatedAt: () => updatedAt,
      poll,
    });

    try {
      await vi.advanceTimersByTimeAsync(0);
      expect(poll).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(4_999);
      expect(poll).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1);
      expect(poll).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(GITHUB_ACTIVITY_POLL_INTERVAL_MS - 1);
      expect(poll).toHaveBeenCalledTimes(2);
    } finally {
      poller.dispose();
    }
  });

  it("does not poll an idle reader", () => {
    expect(
      computeNextPollDelayMs({
        enabled: true,
        intervalMs: 60_000,
        maxAgeMs: 60_000,
        nowMs: 10_000,
        isVisible: true,
        isOnline: true,
        isIdle: true,
      }),
    ).toBeNull();
  });

  describe("with a reader at the window", () => {
    const stubWindow = () => {
      const doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
      vi.stubGlobal("document", doc);
      vi.stubGlobal("window", new EventTarget());
      return doc;
    };
    const start = (poll: () => void, getUpdatedAt: () => number | undefined) =>
      startBrowserPolling({
        enabled: true,
        intervalMs: ATLASSIAN_RESOURCES_POLL_INTERVAL_MS,
        maxAgeMs: ATLASSIAN_RESOURCES_CACHE_MAX_AGE_MS,
        getUpdatedAt,
        poll,
      });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("stops scheduling refreshes once the reader has been idle, and resumes with one read", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(1_000_000);
      const doc = stubWindow();
      let updatedAt: number | undefined;
      const poll = vi.fn(() => {
        updatedAt = Date.now();
      });
      const poller = start(poll, () => updatedAt);
      try {
        await vi.advanceTimersByTimeAsync(0);
        expect(poll).toHaveBeenCalledTimes(1);
        // Reads keep coming while the reader is here (the first arrival counts as presence)...
        await vi.advanceTimersByTimeAsync(ATLASSIAN_RESOURCES_POLL_INTERVAL_MS);
        expect(poll).toHaveBeenCalledTimes(2);
        // ...and stop after the idle window, however long the window stays open.
        await vi.advanceTimersByTimeAsync(USER_IDLE_AFTER_MS);
        const readsWhenIdle = poll.mock.calls.length;
        expect(readsWhenIdle).toBeLessThanOrEqual(2 + USER_IDLE_AFTER_MS / 90_000);
        await vi.advanceTimersByTimeAsync(60 * 60_000);
        expect(poll).toHaveBeenCalledTimes(readsWhenIdle);
        // Showing the window again is not interaction: it stays paused until input.
        doc.dispatchEvent(new Event("visibilitychange"));
        await vi.advanceTimersByTimeAsync(10 * 60_000);
        expect(poll).toHaveBeenCalledTimes(readsWhenIdle);
        // The next interaction reads once, because the data went stale, and the cadence restarts.
        doc.dispatchEvent(new Event("pointermove"));
        await vi.advanceTimersByTimeAsync(0);
        expect(poll).toHaveBeenCalledTimes(readsWhenIdle + 1);
        await vi.advanceTimersByTimeAsync(ATLASSIAN_RESOURCES_POLL_INTERVAL_MS);
        expect(poll).toHaveBeenCalledTimes(readsWhenIdle + 2);
      } finally {
        poller.dispose();
      }
    });

    it("still reads once for a view mounted while the reader is idle", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(2_000_000);
      stubWindow();
      let updatedAt: number | undefined;
      const poll = vi.fn(() => {
        updatedAt = Date.now();
      });
      const first = start(
        () => undefined,
        () => undefined,
      );
      await vi.advanceTimersByTimeAsync(USER_IDLE_AFTER_MS + 1);
      // `first` keeps the activity clock running, and nobody touched the window.
      const poller = start(poll, () => updatedAt);
      try {
        await vi.advanceTimersByTimeAsync(0);
        expect(poll).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(60 * 60_000);
        expect(poll).toHaveBeenCalledTimes(1);
      } finally {
        poller.dispose();
        first.dispose();
      }
    });
  });
});
