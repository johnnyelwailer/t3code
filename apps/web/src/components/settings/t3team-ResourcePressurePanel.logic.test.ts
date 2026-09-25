import type { ResourcePressureConsumer, ResourcePressureEvent } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  autoPauseStateLabel,
  availablePercent,
  canOfferStop,
  describePressureEvent,
  formatPressureBytes,
  panelRefreshIntervalMs,
  stopConfirmMessage,
} from "./t3team-ResourcePressurePanel.logic";

const GIB = 1024 ** 3;

const consumer = (signalable: boolean): ResourcePressureConsumer => ({
  pid: 4242,
  startTimeMs: 7,
  ppid: 1,
  name: "claude",
  command: "claude --print",
  category: signalable ? "provider-root" : "electron-renderer",
  residentBytes: 7 * GIB,
  cpuPercent: 12,
  signalable,
});

describe("ResourcePressurePanel logic", () => {
  it("never re-reads faster than 10 s and follows the server sample period", () => {
    expect(panelRefreshIntervalMs(undefined)).toBe(20_000);
    expect(panelRefreshIntervalMs(1_000)).toBe(10_000);
    expect(panelRefreshIntervalMs(30_000)).toBe(30_000);
  });

  it("offers Stop only for server-signalable processes, naming the exact PID", () => {
    expect(canOfferStop(consumer(true))).toBe(true);
    expect(canOfferStop(consumer(false))).toBe(false);
    expect(stopConfirmMessage(consumer(true))).toContain("Stop process 4242 (claude, 7.0 GB)");
  });

  it("formats bytes, percentages and events", () => {
    expect(formatPressureBytes(512 * 1024 ** 2)).toBe("512 MB");
    expect(formatPressureBytes(12 * GIB)).toBe("12 GB");
    expect(availablePercent(4, 16)).toBe(25);
    expect(availablePercent(1, 0)).toBe(0);
    const event: ResourcePressureEvent = {
      id: 1,
      occurredAt: 0,
      fromLevel: "ok",
      toLevel: "critical",
      availableMemoryBytes: 0,
      totalMemoryBytes: 16 * GIB,
      appTreeRssBytes: 7 * GIB,
      reasons: [],
      topProcessName: "claude",
      topProcessRssBytes: 5 * GIB,
    };
    expect(describePressureEvent(event)).toBe("OK → Critical · app 7.0 GB · top: claude 5.0 GB");
  });

  it("labels where the auto-pause state machine is for paused threads", () => {
    const view = { cooldownMs: 60_000, threads: [] };
    expect(autoPauseStateLabel({ ...view, phase: "pausing", resumesAt: null }, 0)).toBe(
      "holding while critical",
    );
    expect(autoPauseStateLabel({ ...view, phase: "cooldown", resumesAt: 60_000 }, 15_500)).toBe(
      "resuming in 45 s",
    );
    expect(autoPauseStateLabel({ ...view, phase: "running", resumesAt: null }, 0)).toBe("resuming");
  });
});
