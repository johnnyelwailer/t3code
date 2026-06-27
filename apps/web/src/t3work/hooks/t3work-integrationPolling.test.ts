import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  ATLASSIAN_RESOURCES_CACHE_MAX_AGE_MS,
  ATLASSIAN_RESOURCES_POLL_INTERVAL_MS,
  computeNextPollDelayMs,
  GITHUB_ACTIVITY_CACHE_MAX_AGE_MS,
  GITHUB_ACTIVITY_POLL_INTERVAL_MS,
  isPollingOnline,
  isPollingVisible,
  startBrowserPolling,
} from "./t3work-integrationPolling";

describe("t3work integration polling", () => {
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
});
