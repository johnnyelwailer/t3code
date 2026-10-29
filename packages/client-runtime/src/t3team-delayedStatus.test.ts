import { describe, expect, it } from "vite-plus/test";

import {
  delayedStatusDeadline,
  shownDelayedStatus,
  stepDelayedStatus,
  type DelayedStatusState,
  type DelayedStatusTiming,
} from "./delayedStatus.ts";

// The shared default show delay of `stepDelayedStatus`.
const STATUS_SHOW_DELAY_MS = 400;

function step(
  state: DelayedStatusState<string> | null,
  value: string | null,
  now: number,
  timing?: DelayedStatusTiming,
) {
  const deadline = state === null ? null : delayedStatusDeadline(state);
  return stepDelayedStatus(
    state,
    {
      key: "a",
      value,
      deadlinePassed: deadline !== null && now >= deadline,
      ...(timing === undefined ? {} : { timing }),
    },
    () => now,
  );
}

describe("stepDelayedStatus caller timing", () => {
  const timing = { showDelayMs: 600, minVisibleMs: 250 };

  it("takes the show delay and hold from the caller when given", () => {
    const pending = step(null, "syncing", 0, timing);
    expect(delayedStatusDeadline(pending)).toBe(600);
    // The shared default delay has passed, the caller's longer one has not.
    expect(step(pending, "syncing", STATUS_SHOW_DELAY_MS, timing)).toBe(pending);
    expect(step(pending, "syncing", 599, timing)).toBe(pending);

    const shown = step(pending, "syncing", 600, timing);
    expect(shownDelayedStatus(shown, "a")).toBe("syncing");
    expect(delayedStatusDeadline(shown)).toBe(850);

    const clearing = step(shown, null, 700, timing);
    expect(shownDelayedStatus(clearing, "a")).toBe("syncing");
    expect(step(clearing, null, 849, timing)).toBe(clearing);
    expect(step(clearing, null, 850, timing).phase).toBe("idle");
  });

  it("falls back to the shared defaults for whatever the caller leaves out", () => {
    const pending = step(null, "syncing", 0, { minVisibleMs: 250 });
    expect(delayedStatusDeadline(pending)).toBe(STATUS_SHOW_DELAY_MS);
    const shown = step(pending, "syncing", STATUS_SHOW_DELAY_MS, { minVisibleMs: 250 });
    expect(delayedStatusDeadline(shown)).toBe(STATUS_SHOW_DELAY_MS + 250);
  });
});
