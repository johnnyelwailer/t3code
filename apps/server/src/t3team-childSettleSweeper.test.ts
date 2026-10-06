import { assert, describe, it } from "@effect/vitest";
import { ThreadId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import {
  CHILD_SETTLE_STARTUP_GRACE_MS,
  CHILD_SETTLE_SWEEP_INTERVAL_MS,
  CHILD_SETTLE_TTL_MS,
  childSettleAttemptSlot,
  childSettleRetryBlockMs,
  pickSettleSweepCandidates,
  SETTLED_PARENT_SETTLE_COMMAND_PREFIX,
  type SettleSweepShell,
  TTL_SETTLE_COMMAND_PREFIX,
} from "./t3team-childSettleSweepDecide.ts";
import { makeChildSettleSweeper } from "./t3team-childSettleSweeper.ts";

const NOW = Date.parse("2026-02-01T00:00:00.000Z");
const OLD = DateTime.makeUnsafe("2026-01-20T00:00:00.000Z"); // 12d before NOW
const RECENT = DateTime.makeUnsafe("2026-01-31T00:00:00.000Z"); // 24h before NOW

const shell = (
  id: string,
  over: Partial<SettleSweepShell> & { readonly parent?: string | null } = {},
): SettleSweepShell => {
  const { parent = "parent", ...rest } = over;
  return {
    id: ThreadId.make(id),
    lineage: {
      parentThreadId: parent === null ? null : ThreadId.make(parent),
      relationshipToParent: parent === null ? null : "subagent",
      rootThreadId: ThreadId.make(parent ?? id),
    },
    archivedAt: null,
    settledOverride: null,
    updatedAt: OLD,
    latestRunCompletedAt: OLD,
    status: "completed",
    activityRunStatus: null,
    pendingBackgroundTasks: [],
    pendingRuntimeRequest: null,
    ...rest,
  };
};

const pick = (shells: ReadonlyArray<SettleSweepShell>) =>
  pickSettleSweepCandidates(shells, { nowMs: NOW, ttlMs: CHILD_SETTLE_TTL_MS }).map(
    (candidate) => `${candidate.threadId}:${candidate.rule}`,
  );

describe("child settle sweep — candidate selection", () => {
  it("settles a terminal subagent child only after the TTL, never a root or a fork", () => {
    assert.deepStrictEqual(
      pick([
        shell("parent", { parent: null }),
        shell("old-child"),
        shell("fresh-child", { latestRunCompletedAt: RECENT }),
        shell("failed-child", { status: "failed" }),
        shell("idle-child", { status: "idle" }),
        shell("fork", {
          lineage: {
            parentThreadId: ThreadId.make("parent"),
            relationshipToParent: "fork",
            rootThreadId: ThreadId.make("parent"),
          },
        }),
      ]),
      ["old-child:ttl", "failed-child:ttl"],
    );
  });

  it("settles every child of a settled parent regardless of terminality and the TTL", () => {
    assert.deepStrictEqual(
      pick([
        shell("parent", { parent: null, settledOverride: "settled" }),
        shell("idle-child", { status: "idle", latestRunCompletedAt: RECENT }),
        shell("archived-child", { archivedAt: OLD }),
        shell("kept-active", { settledOverride: "active" }),
        shell("already-settled", { settledOverride: "settled" }),
      ]),
      ["idle-child:settled-parent"],
    );
  });

  it("never nominates a child with live work, under either rule", () => {
    const live: ReadonlyArray<Partial<SettleSweepShell>> = [
      { activityRunStatus: "running" },
      { activityRunStatus: "waiting" },
      {
        pendingBackgroundTasks: [
          { kind: "shell", id: "job", label: "watch", startedAt: OLD } as never,
        ],
      },
      {
        pendingRuntimeRequest: {
          id: "request" as never,
          kind: "approval" as never,
          createdAt: OLD,
        },
      },
    ];
    for (const over of live) {
      assert.deepStrictEqual(pick([shell("child", over)]), []);
      assert.deepStrictEqual(
        pick([shell("parent", { parent: null, settledOverride: "settled" }), shell("child", over)]),
        [],
      );
    }
  });

  it("gives every child exactly one startup phase slot across four passes", () => {
    for (const id of ["a", "b", "thread:child-1", "x".repeat(40)]) {
      const slots = [0, 1, 2, 3].filter((slot) => childSettleAttemptSlot(id, slot));
      assert.strictEqual(slots.length, 1);
      assert.strictEqual(childSettleAttemptSlot(id, slots[0]! + 4), true);
    }
  });
});

const makeHarness = (shells: () => ReadonlyArray<SettleSweepShell>, refuse = new Set<string>()) => {
  const dispatched: Array<{ readonly commandId: string; readonly threadId: string }> = [];
  let counter = 0;
  const sweeper = makeChildSettleSweeper(
    {
      listShells: Effect.sync(shells),
      autoSettle: ({ commandId, threadId }) =>
        Effect.suspend(() => {
          dispatched.push({ commandId, threadId });
          return refuse.has(threadId) ? Effect.fail("refused") : Effect.void;
        }),
    },
    // Boot long before NOW: these passes are outside the startup grace.
    { startedAtMs: NOW - 10 * CHILD_SETTLE_STARTUP_GRACE_MS, nonce: () => `n${++counter}` },
  );
  return { sweeper, dispatched };
};

describe("child settle sweeper — dispatch pass", () => {
  it.effect("dispatches auto-settle with a fresh, rule-prefixed command id per attempt", () =>
    Effect.gen(function* () {
      const { sweeper, dispatched } = makeHarness(() => [
        shell("parent", { parent: null, settledOverride: "settled" }),
        shell("child-a", { status: "running", latestRunCompletedAt: null }),
        shell("other-parent", { parent: null }),
        shell("child-b", { parent: "other-parent" }),
      ]);
      assert.strictEqual(yield* sweeper.sweepOnce(NOW), 2);
      assert.deepStrictEqual(dispatched, [
        { commandId: `${SETTLED_PARENT_SETTLE_COMMAND_PREFIX}n1`, threadId: "child-a" },
        { commandId: `${TTL_SETTLE_COMMAND_PREFIX}n2`, threadId: "child-b" },
      ]);
    }),
  );

  it.effect("blocks a refused child for the retry window instead of re-receipting each pass", () =>
    Effect.gen(function* () {
      const { sweeper, dispatched } = makeHarness(() => [shell("child")], new Set(["child"]));
      yield* sweeper.sweepOnce(NOW);
      yield* sweeper.sweepOnce(NOW + CHILD_SETTLE_SWEEP_INTERVAL_MS);
      assert.strictEqual(dispatched.length, 1);
      yield* sweeper.sweepOnce(NOW + childSettleRetryBlockMs());
      assert.strictEqual(dispatched.length, 2);
    }),
  );

  it.effect("sweeps on the tick only when the cadence is due", () =>
    Effect.gen(function* () {
      const { sweeper, dispatched } = makeHarness(() => [shell("child")]);
      yield* sweeper.tick(NOW);
      yield* sweeper.tick(NOW + 5_000);
      assert.strictEqual(dispatched.length, 1);
      yield* sweeper.tick(NOW + CHILD_SETTLE_SWEEP_INTERVAL_MS);
      assert.strictEqual(dispatched.length, 2);
    }),
  );

  it.effect("spreads post-restart attempts across passes during the startup grace", () =>
    Effect.gen(function* () {
      const ids = Array.from({ length: 24 }, (_, index) => `child-${index}`);
      const dispatched: string[] = [];
      const sweeper = makeChildSettleSweeper(
        {
          listShells: Effect.sync(() => ids.map((id) => shell(id))),
          autoSettle: ({ threadId }) => Effect.sync(() => dispatched.push(threadId)),
        },
        { startedAtMs: NOW },
      );
      yield* sweeper.sweepOnce(NOW);
      const first = dispatched.length;
      assert.isAbove(first, 0);
      assert.isBelow(first, ids.length);
      for (let pass = 1; pass < 4; pass += 1) {
        yield* sweeper.sweepOnce(NOW + pass * CHILD_SETTLE_SWEEP_INTERVAL_MS);
      }
      // Without a real settle the same children stay candidates; every child got its slot.
      assert.deepStrictEqual(new Set(dispatched), new Set(ids));
    }),
  );
});
