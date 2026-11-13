import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  recordComponentRender,
  resetRenderCounts,
  snapshotRenderCounts,
  startRendererHeartbeat,
} from "./t3team-rendererHeartbeat";

afterEach(() => {
  resetRenderCounts();
});

describe("renderer heartbeat", () => {
  it("snapshots component render counts", () => {
    recordComponentRender("ProbeHost");
    recordComponentRender("ProbeHost");
    recordComponentRender("Chips");
    expect(snapshotRenderCounts()).toEqual({ ProbeHost: 2, Chips: 1 });
  });

  it("sends a heartbeat immediately and on the interval, then stops", () => {
    vi.useFakeTimers();
    const report = vi.fn();
    const stop = startRendererHeartbeat({ intervalMs: 100, now: () => 7, report });
    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith({ at: 7, lastComponentRenderCounts: {} });
    recordComponentRender("Chips");
    vi.advanceTimersByTime(100);
    expect(report).toHaveBeenCalledTimes(2);
    expect(report.mock.calls[1]![0]).toEqual({ at: 7, lastComponentRenderCounts: { Chips: 1 } });
    stop();
    vi.advanceTimersByTime(200);
    expect(report).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
