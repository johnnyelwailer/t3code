import { describe, expect, it } from "vite-plus/test";
import {
  ACTIVITY_STATE_WORDS,
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

  it("state + enrichment renders '{state} · {detail}'", () => {
    expect(
      resolveActivityPillDisplay({
        label: "Working",
        activityState: "working",
        activityLabel: "editing the retry test",
      }),
    ).toBe("Working · editing the retry test");
    expect(
      resolveActivityPillDisplay({
        label: "Working",
        activityState: "thinking",
        activityLabel: "tracing the error",
      }),
    ).toBe("Thinking · tracing the error");
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

  it("waiting rests (no pulse) with the calm dormant palette", () => {
    expect(resolveActivityStatePill("waiting")).toMatchObject({ pulse: false, label: "Waiting" });
    for (const state of ["thinking", "writing", "working"] as const) {
      expect(resolveActivityStatePill(state)).toMatchObject({ pulse: true });
    }
  });
});
