import { describe, expect, it } from "vite-plus/test";
// @effect-diagnostics globalDate:off -- deterministic ISO stamps built from fixed epoch offsets.
import { ThreadId, type OrchestrationEvent } from "@t3tools/contracts";

import {
  CHILD_CLEANUP_NUDGE_AT,
  CHILD_CLEANUP_NUDGE_COOLDOWN_MS,
  CHILD_CLEANUP_NUDGED_KIND,
  NUDGE_DIGEST_MAX,
  buildCleanupNudgeText,
  childCleanupNudgeAt,
  childCleanupNudgeCooldownMs,
  collectLastCleanupNudges,
  cleanupNudgeDue,
  terminalUnsettledChildStats,
} from "./t3team-childCleanupNudge.ts";
import type { SettleSweepShellLike } from "./t3team-childSettleSweeper.ts";

const NOW = Date.parse("2026-02-01T00:00:00.000Z");
const DAY = 86_400_000;

function shellOf(id: string, ageDays: number, over: Partial<SettleSweepShellLike> = {}) {
  return {
    id,
    title: `child ${id}`,
    updatedAt: new Date(NOW - Math.round(ageDays * DAY)).toISOString(),
    archivedAt: null,
    settledOverride: null,
    session: { status: "idle" },
    latestTurn: { state: "completed" },
    backgroundLiveness: null,
    ...over,
  };
}

describe("cleanup nudge — stats & digest", () => {
  it("counts terminal states, excludes settled/archived/non-terminal, caps top at 20", () => {
    const shells = [
      ...Array.from({ length: 25 }, (_, i) => shellOf(`c${i}`, 3 + i)),
      shellOf("settled-1", 10, { settledOverride: "settled" }),
      shellOf("archived-1", 10, { archivedAt: "2026-01-01T00:00:00.000Z" }),
      shellOf("running-1", 10, { session: { status: "running" } }),
      shellOf("idle-1", 10, { latestTurn: null }),
    ];
    const stats = terminalUnsettledChildStats(shells, NOW);
    expect(stats.count).toBe(25);
    expect(stats.completed).toBe(25);
    expect(stats.failed).toBe(0);
    expect(stats.aborted).toBe(0);
    expect(stats.top).toHaveLength(NUDGE_DIGEST_MAX);
    expect(NUDGE_DIGEST_MAX).toBe(20);
    // Oldest first: the oldest entry is c24 (age 27d).
    expect(stats.top[0]!.threadId).toBe("c24");
    expect(stats.oldestAgeMs).toBe(NOW - Date.parse(new Date(NOW - 27 * DAY).toISOString()));
    // Digest text: the header numbers + top-N enumeration + the sweep pointer.
    const text = buildCleanupNudgeText(stats);
    expect(text).toContain("25 child threads have reached terminal state");
    expect(text).toContain("(25 completed, 0 failed, 0 aborted");
    expect(text).toContain("Top 20 by age");
    expect(text).toContain("1. 'child c24' (completed, 27d)");
    expect(text).toContain("20. 'child c5' (completed, 8d)");
    expect(text).not.toContain("21.");
    expect(text).toContain('t3team_children({ op: "sweep" })');
  });

  it("surfaces failed/aborted breakdowns and the oldest age", () => {
    const stats = terminalUnsettledChildStats(
      [
        shellOf("a", 2, { session: { status: "error" }, latestTurn: { state: "error" } }),
        shellOf("b", 5, {
          session: { status: "interrupted" },
          latestTurn: { state: "interrupted" },
        }),
        shellOf("c", 9),
      ],
      NOW,
    );
    const text = buildCleanupNudgeText(stats);
    expect(stats.completed).toBe(1);
    expect(stats.failed).toBe(1);
    expect(stats.aborted).toBe(1);
    expect(text).toContain("(1 completed, 1 failed, 1 aborted; oldest 9d ago)");
    expect(text).toContain("1. 'child c' (completed, 9d)");
  });
});

describe("cleanup nudge — threshold, cooldown, dedup", () => {
  it("the named defaults match the design constants", () => {
    expect(CHILD_CLEANUP_NUDGE_AT).toBe(10);
    expect(CHILD_CLEANUP_NUDGE_COOLDOWN_MS).toBe(12 * 60 * 60 * 1_000);
    expect(childCleanupNudgeAt()).toBe(10);
    expect(childCleanupNudgeCooldownMs()).toBe(12 * 60 * 60 * 1_000);
  });

  it("below the threshold: never nudged", () => {
    expect(
      cleanupNudgeDue({ count: 9, threshold: 10, cooldownMs: 12 * 3_600_000, nowMs: NOW }),
    ).toBe(false);
  });

  it("first crossing of the threshold: nudged", () => {
    expect(
      cleanupNudgeDue({
        count: 10,
        threshold: 10,
        cooldownMs: 12 * 3_600_000,
        nowMs: NOW,
        last: null,
      }),
    ).toBe(true);
  });

  it("inside the cooldown below the next multiple: held", () => {
    expect(
      cleanupNudgeDue({
        count: 12,
        threshold: 10,
        cooldownMs: 12 * 3_600_000,
        nowMs: NOW,
        last: { atMs: NOW - 3_600_000, nudgedCount: 10 },
      }),
    ).toBe(false);
  });

  it("crossing the NEXT multiple of the threshold: re-nudged despite the cooldown", () => {
    expect(
      cleanupNudgeDue({
        count: 20,
        threshold: 10,
        cooldownMs: 12 * 3_600_000,
        nowMs: NOW,
        last: { atMs: NOW - 3_600_000, nudgedCount: 12 },
      }),
    ).toBe(true);
  });

  it("cooldown elapsed with the threshold still met: re-nudged", () => {
    expect(
      cleanupNudgeDue({
        count: 10,
        threshold: 10,
        cooldownMs: 12 * 3_600_000,
        nowMs: NOW,
        last: { atMs: NOW - 13 * 3_600_000, nudgedCount: 10 },
      }),
    ).toBe(true);
  });

  it("honors the env overrides", () => {
    const prevAt = process.env["T3TEAM_CHILD_CLEANUP_NUDGE_AT"];
    const prevCooldown = process.env["T3TEAM_CHILD_CLEANUP_NUDGE_COOLDOWN_MS"];
    process.env["T3TEAM_CHILD_CLEANUP_NUDGE_AT"] = "3";
    process.env["T3TEAM_CHILD_CLEANUP_NUDGE_COOLDOWN_MS"] = "60000";
    try {
      expect(childCleanupNudgeAt()).toBe(3);
      expect(childCleanupNudgeCooldownMs()).toBe(60_000);
      expect(
        cleanupNudgeDue({
          count: 3,
          threshold: childCleanupNudgeAt(),
          cooldownMs: 60_000,
          nowMs: NOW,
        }),
      ).toBe(true);
    } finally {
      for (const [name, value] of [
        ["T3TEAM_CHILD_CLEANUP_NUDGE_AT", prevAt],
        ["T3TEAM_CHILD_CLEANUP_NUDGE_COOLDOWN_MS", prevCooldown],
      ] as const) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
      expect(childCleanupNudgeAt()).toBe(CHILD_CLEANUP_NUDGE_AT);
    }
  });
});

describe("cleanup nudge — dedup rehydration from the event stream", () => {
  const nudgeEvent = (
    threadId: string,
    at: string,
    count: number,
    over: Record<string, unknown> = {},
  ) =>
    ({
      type: "thread.activity-appended",
      payload: {
        threadId,
        activity: { kind: CHILD_CLEANUP_NUDGED_KIND, payload: { at, count } },
      },
      ...over,
    }) as unknown as OrchestrationEvent;

  it("collects the newest nudged marker per parent", () => {
    const map = collectLastCleanupNudges([
      nudgeEvent("p1", "2026-01-01T00:00:00.000Z", 10),
      nudgeEvent("p2", "2026-01-02T00:00:00.000Z", 15),
      nudgeEvent("p1", "2026-01-05T00:00:00.000Z", 20), // newest wins for p1
    ]);
    expect(map.get("p1" as ThreadId)).toEqual({
      atMs: Date.parse("2026-01-05T00:00:00.000Z"),
      nudgedCount: 20,
    });
    expect(map.get("p2" as ThreadId)).toEqual({
      atMs: Date.parse("2026-01-02T00:00:00.000Z"),
      nudgedCount: 15,
    });
  });

  it("ignores other event types, other activity kinds, and malformed payloads", () => {
    const map = collectLastCleanupNudges([
      nudgeEvent("p1", "2026-01-01T00:00:00.000Z", 10, {
        type: "thread.message-appended",
      }),
      nudgeEvent("p1", "2026-01-01T00:00:00.000Z", 10, {
        payload: { threadId: "p1", activity: { kind: "t3team.handoff.created", payload: {} } },
      }),
      nudgeEvent("p1", "not-a-date", 10),
    ]);
    expect(map.size).toBe(0);
  });
});
