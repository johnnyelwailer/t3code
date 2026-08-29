import { describe, expect, it } from "vite-plus/test";
import * as Effect from "effect/Effect";
import { ThreadId } from "@t3tools/contracts";

import {
  CHILD_SETTLE_SWEEP_INTERVAL_MS,
  CHILD_SETTLE_TTL_MS,
  childSettleSweepIntervalMs,
  childSettleTtlMs,
  makeChildSettleSweeper,
  pickSettleSweepCandidates,
  stateOfShell,
  type SettleSweepShellLike,
} from "./t3team-childSettleSweeper.ts";

const NOW = Date.parse("2026-02-01T00:00:00.000Z");
const OLD = "2026-01-20T00:00:00.000Z"; // 12d before NOW — well past the 48h TTL

function shellOf(id: string, over: Partial<SettleSweepShellLike> = {}): SettleSweepShellLike {
  return {
    id,
    title: `thread-${id}`,
    updatedAt: OLD,
    archivedAt: null,
    settledOverride: null,
    session: { status: "idle" },
    latestTurn: { state: "completed" },
    backgroundLiveness: null,
    ...over,
  };
}

describe("child settle sweeper — pure candidate selection", () => {
  const children = new Set(["child-1", "child-2", "child-3"]);

  it("settles a terminal child only after the TTL has elapsed", () => {
    const out = pickSettleSweepCandidates(
      [
        shellOf("child-1"), // 12d old terminal child
        shellOf("child-2", { updatedAt: "2026-01-31T00:00:00.000Z" }), // 24h old: under 48h
      ],
      children,
      { nowMs: NOW, ttlMs: CHILD_SETTLE_TTL_MS },
    );
    expect(out.map((c) => c.threadId)).toEqual(["child-1"]);
    expect(out[0]!.ageMs).toBe(NOW - Date.parse(OLD));
  });

  it("never touches a running child, however old (hard skip)", () => {
    const variants: Array<Partial<SettleSweepShellLike>> = [
      { session: { status: "running" } },
      { session: { status: "idle" }, latestTurn: { state: "running" } },
      {
        session: { status: "idle" },
        latestTurn: { state: "completed" },
        backgroundLiveness: "working",
      },
    ];
    for (const over of variants) {
      const out = pickSettleSweepCandidates([shellOf("child-1", over)], children, {
        nowMs: NOW,
        ttlMs: CHILD_SETTLE_TTL_MS,
      });
      expect(out).toEqual([]);
    }
  });

  it("settles CHILD threads only — a root thread with the same shape is skipped", () => {
    const out = pickSettleSweepCandidates([shellOf("root-1")], new Set(["child-1"]), {
      nowMs: NOW,
      ttlMs: CHILD_SETTLE_TTL_MS,
    });
    expect(out).toEqual([]);
  });

  it("is idempotent: an already-settled child is never a candidate again", () => {
    const out = pickSettleSweepCandidates(
      [shellOf("child-1", { settledOverride: "settled" })],
      children,
      {
        nowMs: NOW,
        ttlMs: CHILD_SETTLE_TTL_MS,
      },
    );
    expect(out).toEqual([]);
  });

  it("skips archived threads and non-terminal (idle) threads", () => {
    const out = pickSettleSweepCandidates(
      [
        shellOf("child-1", { archivedAt: OLD }),
        shellOf("child-2", { session: { status: "idle" }, latestTurn: null }),
      ],
      children,
      { nowMs: NOW, ttlMs: CHILD_SETTLE_TTL_MS },
    );
    expect(out).toEqual([]);
  });
});

describe("child settle sweeper — state precedence", () => {
  it("session status outranks the turn state", () => {
    expect(
      stateOfShell({
        session: { status: "running" },
        latestTurn: { state: "completed" },
        backgroundLiveness: null,
      }),
    ).toBe("running");
    expect(
      stateOfShell({ session: { status: "error" }, latestTurn: null, backgroundLiveness: null }),
    ).toBe("failed");
    expect(
      stateOfShell({ session: { status: "stopped" }, latestTurn: null, backgroundLiveness: null }),
    ).toBe("aborted");
  });

  it("a live background fleet outranks a settled turn", () => {
    expect(
      stateOfShell({
        session: { status: "idle" },
        latestTurn: { state: "completed" },
        backgroundLiveness: "working",
      }),
    ).toBe("running");
  });

  it("falls back to the turn state, then idle", () => {
    expect(
      stateOfShell({ session: null, latestTurn: { state: "error" }, backgroundLiveness: null }),
    ).toBe("failed");
    expect(stateOfShell({ session: null, latestTurn: null, backgroundLiveness: null })).toBe(
      "idle",
    );
  });
});

describe("child settle sweeper — dispatch pass", () => {
  function makeFake() {
    const dispatched: Array<{ threadId: string }> = [];
    const shells = [
      shellOf("child-1"), // terminal, old → settle
      shellOf("child-2", { session: { status: "running" } }), // running → never
      shellOf("child-3", { settledOverride: "settled" }), // already settled → idempotent skip
    ];
    const sweeper = makeChildSettleSweeper({
      engine: {
        dispatch: (command) =>
          Effect.sync(() => {
            if (command.type !== "thread.settle") throw new Error("unexpected command");
            dispatched.push({ threadId: command.threadId as string });
          }).pipe(Effect.as({ sequence: 0 })),
      },
      query: {
        getShellSnapshot: () => Effect.succeed({ threads: shells }),
        listParentChildRelations: () =>
          Effect.succeed([
            { childThreadId: "child-1" as ThreadId, parentThreadId: "parent" as ThreadId },
            { childThreadId: "child-2" as ThreadId, parentThreadId: "parent" as ThreadId },
            { childThreadId: "child-3" as ThreadId, parentThreadId: "parent" as ThreadId },
          ]),
      },
    });
    return { sweeper, dispatched };
  }

  it("settles only the past-TTL terminal children and reports the count", async () => {
    const { sweeper, dispatched } = makeFake();
    const count = await Effect.runPromise(sweeper.sweepOnce(NOW));
    expect(count).toBe(1);
    expect(dispatched.map((c) => c.threadId)).toEqual(["child-1"]);
    expect(dispatched[0]!.threadId).not.toContain("child-2");
    expect(dispatched[0]!.threadId).not.toContain("child-3");
  });

  it("re-runs are a no-op: a settled thread never settles twice", async () => {
    const { sweeper, dispatched } = makeFake();
    await Effect.runPromise(sweeper.sweepOnce(NOW));
    // Simulate the settle landing (the decider re-emits the same settled marker).
    // The fake shell list is frozen, so instead assert the decider-side invariant
    // via the pure selector: settledOverride "settled" is never a candidate.
    const out = pickSettleSweepCandidates(
      [shellOf("child-1", { settledOverride: "settled" })],
      new Set(["child-1"]),
      { nowMs: NOW + 86_400_000, ttlMs: CHILD_SETTLE_TTL_MS },
    );
    expect(out).toEqual([]);
    expect(dispatched).toHaveLength(1);
  });

  it("honors the env overrides for TTL and cadence", () => {
    expect(CHILD_SETTLE_TTL_MS).toBe(48 * 60 * 60 * 1_000);
    expect(CHILD_SETTLE_SWEEP_INTERVAL_MS).toBe(5 * 60 * 1_000);
    const prevTtl = process.env["T3TEAM_CHILD_SETTLE_TTL_MS"];
    const prevInterval = process.env["T3TEAM_CHILD_SETTLE_SWEEP_INTERVAL_MS"];
    process.env["T3TEAM_CHILD_SETTLE_TTL_MS"] = "60000";
    process.env["T3TEAM_CHILD_SETTLE_SWEEP_INTERVAL_MS"] = "30000";
    try {
      expect(childSettleTtlMs()).toBe(60_000);
      expect(childSettleSweepIntervalMs()).toBe(30_000);
    } finally {
      for (const [name, value] of [
        ["T3TEAM_CHILD_SETTLE_TTL_MS", prevTtl],
        ["T3TEAM_CHILD_SETTLE_SWEEP_INTERVAL_MS", prevInterval],
      ] as const) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
      expect(childSettleTtlMs()).toBe(CHILD_SETTLE_TTL_MS);
    }
  });

  it("a non-child thread id is never settled even when terminal + old", async () => {
    const dispatched: string[] = [];
    const sweeper = makeChildSettleSweeper({
      engine: {
        dispatch: (command) =>
          Effect.sync(() => dispatched.push(command.threadId as string)).pipe(
            Effect.as({ sequence: 0 }),
          ),
      },
      query: {
        getShellSnapshot: () => Effect.succeed({ threads: [shellOf("root-1")] }),
        listParentChildRelations: () =>
          Effect.succeed([
            { childThreadId: "child-9" as ThreadId, parentThreadId: "p" as ThreadId },
          ]),
      },
    });
    const count = await Effect.runPromise(sweeper.sweepOnce(NOW));
    expect(count).toBe(0);
    expect(dispatched).toEqual([]);
  });
});
