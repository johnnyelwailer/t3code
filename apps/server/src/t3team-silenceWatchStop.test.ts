import { describe, expect, it } from "@effect/vitest";

import { isTrueTerminalSessionStatus, shouldStopSilenceWatch } from "./t3team-silenceWatchStop.ts";

describe("shouldStopSilenceWatch", () => {
  it.each(["error", "interrupted", "stopped"])(
    "stops terminal status %s even while background work is live",
    (status) => {
      expect(shouldStopSilenceWatch(status, "working")).toBe(true);
    },
  );

  it.each(["ready", "idle"])("stops %s when background liveness is empty", (status) => {
    expect(shouldStopSilenceWatch(status, null)).toBe(true);
  });

  it.each(["working", "monitoring"] as const)("keeps idle armed during %s work", (liveness) => {
    expect(shouldStopSilenceWatch("idle", liveness)).toBe(false);
  });

  it.each([undefined, "running", "starting", "resuming", "mystery"])(
    "does not stop unknown/non-terminal status %s",
    (status) => {
      expect(shouldStopSilenceWatch(status, null)).toBe(false);
    },
  );
});

describe("isTrueTerminalSessionStatus", () => {
  it.each(["error", "interrupted", "stopped", "deleted"])("reports true terminal %s", (status) => {
    expect(isTrueTerminalSessionStatus(status)).toBe(true);
  });

  it.each([undefined, "ready", "idle", "running", "starting"])(
    "rejects non-terminal status %s (a turn-end is not a terminal fact)",
    (status) => {
      expect(isTrueTerminalSessionStatus(status)).toBe(false);
    },
  );
});
