import { describe, expect, it } from "vite-plus/test";
import * as ThreadPlanStaleness from "./ThreadPlanStaleness.ts";
import { PLAN_STALENESS_NUDGE_THRESHOLD } from "./planStalenessNudge.ts";

describe("ThreadPlanStaleness", () => {
  it("counts tool activities appended after a plan write", () => {
    const staleness = ThreadPlanStaleness.make();
    const threadId = "t-plan-age-1";
    expect(staleness.getPlanAge(threadId)).toBe(0);

    staleness.recordPlanWrite(threadId);
    for (let i = 0; i < PLAN_STALENESS_NUDGE_THRESHOLD; i += 1) {
      staleness.recordToolActivity(threadId);
    }
    expect(staleness.getPlanAge(threadId)).toBe(PLAN_STALENESS_NUDGE_THRESHOLD);
  });

  it("resets the count when a new plan is written", () => {
    const staleness = ThreadPlanStaleness.make();
    const threadId = "t-plan-age-2";
    for (let i = 0; i < 30; i += 1) {
      staleness.recordToolActivity(threadId);
    }
    expect(staleness.getPlanAge(threadId)).toBe(30);

    staleness.recordPlanWrite(threadId);
    expect(staleness.getPlanAge(threadId)).toBe(0);

    staleness.recordToolActivity(threadId);
    expect(staleness.getPlanAge(threadId)).toBe(1);
  });

  it("keeps the count per thread", () => {
    const staleness = ThreadPlanStaleness.make();
    staleness.recordToolActivity("thread-a");
    staleness.recordToolActivity("thread-a");
    staleness.recordToolActivity("thread-b");
    expect(staleness.getPlanAge("thread-a")).toBe(2);
    expect(staleness.getPlanAge("thread-b")).toBe(1);

    staleness.recordPlanWrite("thread-b");
    expect(staleness.getPlanAge("thread-a")).toBe(2);
    expect(staleness.getPlanAge("thread-b")).toBe(0);
  });
});
