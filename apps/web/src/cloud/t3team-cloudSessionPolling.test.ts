import { describe, expect, it, vi } from "vite-plus/test";

import { startCloudSessionListPolling } from "./t3team-cloudSessionPolling";

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
});
