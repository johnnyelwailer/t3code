import { describe, expect, it } from "vite-plus/test";

import { digestSprintProgress } from "~/t3team/t3team-projectMyWorkDigestSprintProgress";

const DAY = 24 * 60 * 60 * 1000;
const START = "2026-09-03T00:00:00.000Z";
const END = "2026-09-23T00:00:00.000Z";
const startMs = Date.parse(START);
const sprint = { startDate: START, endDate: END };

describe("digestSprintProgress", () => {
  it("reports an in-flight sprint without an ended label", () => {
    const p = digestSprintProgress(sprint, startMs + 10 * DAY);
    expect(p).toEqual({ total: 20, day: 10, daysLeft: 10, pct: 50, ended: null });
  });

  it("clamps a sprint past its end to 100 % and says how long ago it ended", () => {
    // The live "PW Sprint 8.5" case: 32 days into a 20-day sprint is 160 %+ unclamped.
    const p = digestSprintProgress(sprint, startMs + 32 * DAY);
    expect(p.pct).toBe(100);
    expect(p.day).toBe(20);
    expect(p.daysLeft).toBe(0);
    expect(p.ended).toBe("ended 12 d ago");
  });

  it("says plain 'ended' on the day it ended", () => {
    expect(digestSprintProgress(sprint, Date.parse(END) + 3_600_000).ended).toBe("ended");
  });

  it("clamps a sprint that has not started to 0 %", () => {
    const p = digestSprintProgress(sprint, startMs - 5 * DAY);
    expect(p.pct).toBe(0);
    expect(p.ended).toBeNull();
  });

  it("labels a closed sprint even before its end date", () => {
    const p = digestSprintProgress({ ...sprint, state: "Closed" }, startMs + 5 * DAY);
    expect(p.ended).toBe("closed");
    expect(p.pct).toBe(25);
  });

  it.each([
    ["empty span (missing dates collapse to one instant)", { startDate: START, endDate: START }],
    ["unparsable start", { startDate: "nope", endDate: END }],
    ["unparsable end", { startDate: START, endDate: "" }],
    ["inverted span", { startDate: END, endDate: START }],
  ])("has no progress for %s", (_label, dates) => {
    const p = digestSprintProgress(dates, startMs + DAY);
    expect(p.pct).toBeNull();
    expect(p.ended).toBeNull();
  });

  it("has no progress when now is NaN", () => {
    expect(digestSprintProgress(sprint, Number.NaN).pct).toBeNull();
  });
});
