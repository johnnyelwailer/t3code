import { describe, expect, it } from "vite-plus/test";
import { PLAN_STALENESS_NUDGE_THRESHOLD, renderPlanStalenessNudge } from "./planStalenessNudge.ts";

describe("renderPlanStalenessNudge", () => {
  it("stays silent below the threshold", () => {
    expect(renderPlanStalenessNudge(0)).toBeUndefined();
    expect(renderPlanStalenessNudge(PLAN_STALENESS_NUDGE_THRESHOLD - 1)).toBeUndefined();
  });

  it("renders exactly one line at the threshold, naming the count", () => {
    expect(renderPlanStalenessNudge(PLAN_STALENESS_NUDGE_THRESHOLD)).toBe(
      `Your task list is stale (${PLAN_STALENESS_NUDGE_THRESHOLD} tool calls since last update). Update it now, before other work.`,
    );
  });

  it("renders one line above the threshold with the live count", () => {
    const line = renderPlanStalenessNudge(42);
    expect(line).toBe(
      "Your task list is stale (42 tool calls since last update). Update it now, before other work.",
    );
    expect(line ?? "").not.toContain("\n");
  });
});
