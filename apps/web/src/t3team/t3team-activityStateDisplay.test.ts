import { describe, expect, it } from "vite-plus/test";
import {
  ACTIVITY_STATE_WORDS,
  activityPulseClass,
  resolveActivityPillDisplay,
  resolveActivityStatePill,
} from "./t3team-activityStateDisplay";

describe("activity state display (GHE #208)", () => {
  it("maps all four states to their base words", () => {
    expect(ACTIVITY_STATE_WORDS).toEqual({
      thinking: "Thinking",
      writing: "Writing",
      working: "Working",
      waiting: "Waiting",
    });
  });

  it("the LLM label REPLACES the state word when present (never both)", () => {
    expect(
      resolveActivityPillDisplay({
        label: "Working",
        activityState: "working",
        activityLabel: "editing the retry test",
      }),
    ).toBe("editing the retry test");
    expect(
      resolveActivityPillDisplay({
        label: "Working",
        activityState: "thinking",
        activityLabel: "tracing the error",
      }),
    ).toBe("tracing the error");
  });

  it("flag off / LLM failure: the state word stands alone", () => {
    expect(resolveActivityPillDisplay({ label: "Working", activityState: "writing" })).toBe(
      "Writing",
    );
    expect(
      resolveActivityPillDisplay({
        label: "Working",
        activityState: "writing",
        activityLabel: "   ",
      }),
    ).toBe("Writing");
  });

  it("waiting renders without the enrichment word when absent", () => {
    expect(resolveActivityPillDisplay({ label: "Working", activityState: "waiting" })).toBe(
      "Waiting",
    );
  });

  it("no state word (old server / idle): pre-#208 fallbacks", () => {
    expect(
      resolveActivityPillDisplay({ label: "Working", activityLabel: "Reading contracts" }),
    ).toBe("Reading contracts");
    expect(resolveActivityPillDisplay({ label: "Working" })).toBe("Working");
    expect(resolveActivityPillDisplay({ label: "Completed" })).toBe("Completed");
  });

  it("waiting is quieter: dim slate + the slower pulse variant", () => {
    expect(resolveActivityStatePill("waiting")).toMatchObject({
      pulse: true,
      pulseClass: "animate-status-pulse-slow",
      label: "Waiting",
    });
    for (const state of ["thinking", "writing", "working"] as const) {
      const pill = resolveActivityStatePill(state);
      expect(pill).toMatchObject({ pulse: true });
      expect(pill.pulseClass).toBeUndefined();
    }
  });

  it("activityPulseClass: pulse off → none, override wins, else the standard pulse", () => {
    expect(activityPulseClass({ pulse: false })).toBe("");
    expect(activityPulseClass({ pulse: false, pulseClass: "animate-status-pulse-slow" })).toBe("");
    expect(activityPulseClass({ pulse: true })).toBe("animate-status-pulse");
    expect(activityPulseClass({ pulse: true, pulseClass: "animate-status-pulse-slow" })).toBe(
      "animate-status-pulse-slow",
    );
  });
});
