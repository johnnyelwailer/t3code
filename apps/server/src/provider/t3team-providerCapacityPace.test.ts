/**
 * Unit tests for the per-window pace clause: long windows against
 * sustainable pace with calendar anchors, short windows with clock anchors,
 * and the honesty fallbacks.
 */
import { assert, it } from "@effect/vitest";
import { describe } from "vite-plus/test";

import { describeWindowPace } from "./t3team-providerCapacityPace.ts";
import type { ProviderUsageBurn } from "./t3team-providerUsageHistory.ts";

const burn = (percentPerHour: number): ProviderUsageBurn => ({
  percentPerHour,
  sampleSpanMinutes: 120,
  sampleCount: 4,
});

const ISO = (iso: string): number => Date.parse(iso);

describe("describeWindowPace — long windows", () => {
  it("renders the sustainable-pace multiple with concrete dates (monthly)", () => {
    // now Oct 26 00:00Z, 40% used, reset Nov 1 00:00Z → 6 days left,
    // sustainable = 60%/6d = 10%/day. Actual 23%/day → 2.3×; exhaustion in
    // 60/23 ≈ 2.61 days → Oct 28 14:34Z → ~3 days before the reset.
    const clause = describeWindowPace(
      { usedPercent: 40, kind: "monthly", resetsAt: "2026-11-01T00:00:00.000Z" },
      burn(23 / 24),
      ISO("2026-10-26T00:00:00.000Z"),
    );
    assert.equal(
      clause,
      "burning ~23%/day (2.3× sustainable) -> exhausts 3 days before the Nov 1 reset",
    );
  });

  it("reports outlasting the reset when the pace is sustainable", () => {
    // now Oct 12, 20% used, reset Oct 19 → sustainable ≈ 11.4%/day;
    // actual 9.6%/day → exhaustion ≈ 8.3 days out, past the reset.
    const clause = describeWindowPace(
      { usedPercent: 20, kind: "weekly", resetsAt: "2026-10-19T00:00:00.000Z" },
      burn(0.4),
      ISO("2026-10-12T00:00:00.000Z"),
    );
    assert.equal(
      clause,
      "burning ~9.6%/day (0.8× sustainable) -> outlasts the Oct 19 reset by 1 day",
    );
  });

  it("falls back to the bare pace when no reset is published", () => {
    const clause = describeWindowPace(
      { usedPercent: 20, kind: "monthly", resetsAt: undefined },
      burn(2),
      ISO("2026-10-12T00:00:00.000Z"),
    );
    assert.equal(clause, "burning ~48%/day (no reset reported)");
  });

  it("says the window is exhausted instead of projecting", () => {
    const clause = describeWindowPace(
      { usedPercent: 100, kind: "monthly", resetsAt: "2026-11-01T00:00:00.000Z" },
      burn(23),
      ISO("2026-10-26T00:00:00.000Z"),
    );
    assert.equal(clause, "window already exhausted");
  });
});

describe("describeWindowPace — short windows", () => {
  it("anchors on concrete clock times", () => {
    // now 14:00Z, 50% used, reset 18:10Z; burn 60%/h → exhausts in 50m.
    const clause = describeWindowPace(
      { usedPercent: 50, kind: "session", resetsAt: "2026-10-12T18:10:00.000Z" },
      burn(60),
      ISO("2026-10-12T14:00:00.000Z"),
    );
    assert.equal(clause, "exhausts 14:50Z, resets 18:10Z");
  });

  it("omits the reset anchor when none is published", () => {
    const clause = describeWindowPace(
      { usedPercent: 50, kind: "session", resetsAt: undefined },
      burn(60),
      ISO("2026-10-12T14:00:00.000Z"),
    );
    assert.equal(clause, "exhausts 14:50Z");
  });
});

describe("describeWindowPace — honesty", () => {
  it("never invents a rate from a sparse history", () => {
    const clause = describeWindowPace(
      { usedPercent: 95, kind: "session", resetsAt: "2026-10-12T18:10:00.000Z" },
      undefined,
      ISO("2026-10-12T14:00:00.000Z"),
    );
    assert.equal(clause, "no recent samples yet");
  });

  it("never invents a pace for an exhausted window without samples", () => {
    const clause = describeWindowPace(
      { usedPercent: 100, kind: "weekly", resetsAt: "2026-10-19T00:00:00.000Z" },
      undefined,
      ISO("2026-10-12T00:00:00.000Z"),
    );
    assert.equal(clause, "no recent samples yet");
  });
});
