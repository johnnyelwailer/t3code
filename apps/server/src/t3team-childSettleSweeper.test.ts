/* oxlint-disable t3code/no-manual-effect-runtime-in-tests -- Legacy async tests bridge Effect runtimes manually; tracked cleanup is separate from the green gate. */
import { describe, expect, it } from "vite-plus/test";
import * as Effect from "effect/Effect";
import { ThreadId } from "@t3tools/contracts";

import {
  CHILD_SETTLE_STARTUP_GRACE_MS,
  CHILD_SETTLE_SWEEP_INTERVAL_MS,
  CHILD_SETTLE_TTL_MS,
  childSettleAttemptSlot,
  childSettleRetryBlockMs,
  childSettleStartupGraceMs,
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
  const noSettledParents = new Set<string>();

  it("settles a terminal child only after the TTL has elapsed", () => {
    const out = pickSettleSweepCandidates(
      [
        shellOf("child-1"), // 12d old terminal child
        shellOf("child-2", { updatedAt: "2026-01-31T00:00:00.000Z" }), // 24h old: under 48h
      ],
      children,
      { nowMs: NOW, ttlMs: CHILD_SETTLE_TTL_MS, settledParentChildren: noSettledParents },
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
        settledParentChildren: noSettledParents,
      });
      expect(out).toEqual([]);
    }
  });

  it("settles CHILD threads only — a root thread with the same shape is skipped", () => {
    const out = pickSettleSweepCandidates([shellOf("root-1")], new Set(["child-1"]), {
      nowMs: NOW,
      ttlMs: CHILD_SETTLE_TTL_MS,
      settledParentChildren: noSettledParents,
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
        settledParentChildren: new Set(["child-1"]),
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
      { nowMs: NOW, ttlMs: CHILD_SETTLE_TTL_MS, settledParentChildren: noSettledParents },
    );
    expect(out).toEqual([]);
  });

  it("settles children of a settled parent regardless of terminality and the TTL", () => {
    const out = pickSettleSweepCandidates(
      [
        // idle and fresh: non-terminal and nowhere near the TTL — only the settled parent qualifies it
        shellOf("child-1", { session: { status: "idle" }, latestTurn: null }),
        // terminal but 24h old (under the 48h TTL)
        shellOf("child-2", { updatedAt: "2026-01-31T00:00:00.000Z" }),
      ],
      children,
      {
        nowMs: NOW,
        ttlMs: CHILD_SETTLE_TTL_MS,
        settledParentChildren: new Set(["child-1", "child-2"]),
      },
    );
    expect(out.map((c) => c.threadId)).toEqual(["child-1", "child-2"]);
  });

  it("an un-settled parent gives its children no special treatment: non-terminal and fresh stay out", () => {
    const out = pickSettleSweepCandidates(
      [
        shellOf("child-1", { session: { status: "idle" }, latestTurn: null }),
        shellOf("child-2", { updatedAt: "2026-01-31T00:00:00.000Z" }),
      ],
      children,
      { nowMs: NOW, ttlMs: CHILD_SETTLE_TTL_MS, settledParentChildren: noSettledParents },
    );
    expect(out).toEqual([]);
  });

  it("still skips an archived child of a settled parent", () => {
    const out = pickSettleSweepCandidates([shellOf("child-1", { archivedAt: OLD })], children, {
      nowMs: NOW,
      ttlMs: CHILD_SETTLE_TTL_MS,
      settledParentChildren: new Set(["child-1"]),
    });
    expect(out).toEqual([]);
  });

  it("never nominates a live-work child of a settled parent — running session/turn or any background liveness", () => {
    const variants: Array<{ label: string; over: Partial<SettleSweepShellLike> }> = [
      { label: "running session", over: { session: { status: "running" } } },
      { label: "starting session", over: { session: { status: "starting" } } },
      {
        label: "running turn",
        over: { session: { status: "idle" }, latestTurn: { state: "running" } },
      },
      {
        label: "live background fleet",
        over: {
          session: { status: "idle" },
          latestTurn: { state: "completed" },
          backgroundLiveness: "working",
        },
      },
      {
        // A Monitor watch loop: liveness WITHOUT running state — stateOfShell
        // alone would call this idle, the liveness flag must still gate it.
        label: "monitoring watch loop",
        over: {
          session: { status: "idle" },
          latestTurn: { state: "completed" },
          backgroundLiveness: "monitoring",
        },
      },
    ];
    for (const { label, over } of variants) {
      const out = pickSettleSweepCandidates([shellOf("child-1", over)], children, {
        nowMs: NOW,
        ttlMs: CHILD_SETTLE_TTL_MS,
        settledParentChildren: new Set(["child-1"]),
      });
      expect(out, label).toEqual([]);
    }
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
      {
        nowMs: NOW + 86_400_000,
        ttlMs: CHILD_SETTLE_TTL_MS,
        settledParentChildren: new Set(["child-1"]),
      },
    );
    expect(out).toEqual([]);
    expect(dispatched).toHaveLength(1);
  });
});

describe("child settle sweeper — settled-parent rule (dispatch pass)", () => {
  const idleChildOf = (id: string) =>
    // Wedged non-terminal child: idle session, no turn, fresh updatedAt —
    // the shape of the checkpoint-failure children the invariant targets.
    shellOf(id, {
      session: { status: "idle" },
      latestTurn: null,
      updatedAt: "2026-01-31T00:00:00.000Z", // 24h: under the 48h TTL
    });

  const idleChild = () => idleChildOf("child-1");

  interface FakeCommand {
    threadId: string;
    requireSettledParentThreadId: string | undefined;
    requireNoLiveBackgroundLiveness: boolean | undefined;
  }

  function makeSweeper(parentOverride: string | null) {
    const dispatched: FakeCommand[] = [];
    const sweeper = makeChildSettleSweeper({
      engine: {
        dispatch: (command) =>
          Effect.sync(() => {
            if (command.type !== "thread.settle") throw new Error("unexpected command");
            dispatched.push({
              threadId: command.threadId as string,
              requireSettledParentThreadId: command.requireSettledParentThreadId as
                | string
                | undefined,
              requireNoLiveBackgroundLiveness:
                command.requireNoLiveBackgroundLiveness === undefined
                  ? undefined
                  : (command.requireNoLiveBackgroundLiveness as boolean),
            });
          }).pipe(Effect.as({ sequence: 0 })),
      },
      query: {
        getShellSnapshot: () =>
          Effect.succeed({
            threads: [{ ...shellOf("parent-1"), settledOverride: parentOverride }, idleChild()],
          }),
        listParentChildRelations: () =>
          Effect.succeed([
            {
              childThreadId: "child-1" as ThreadId,
              parentThreadId: "parent-1" as ThreadId,
            },
          ]),
      },
    });
    return { sweeper, dispatched };
  }

  it("settles a non-terminal child whose parent is settled on the next sweep, with the parent precondition attached", async () => {
    const { sweeper, dispatched } = makeSweeper("settled");
    const count = await Effect.runPromise(sweeper.sweepOnce(NOW));
    expect(count).toBe(1);
    expect(dispatched).toEqual([
      {
        threadId: "child-1",
        requireSettledParentThreadId: "parent-1",
        requireNoLiveBackgroundLiveness: true,
      },
    ]);
  });

  it("does NOT attach the precondition to a TTL-rule settle of a child whose parent is not settled", async () => {
    const dispatched: string[] = [];
    const sweeper = makeChildSettleSweeper({
      engine: {
        dispatch: (command) =>
          Effect.sync(() => {
            if (command.requireSettledParentThreadId !== undefined) {
              throw new Error("precondition must not be attached to TTL settles");
            }
            dispatched.push(command.threadId as string);
          }).pipe(Effect.as({ sequence: 0 })),
      },
      query: {
        getShellSnapshot: () =>
          Effect.succeed({
            threads: [shellOf("parent-1"), shellOf("child-1")], // un-settled parent, old terminal child
          }),
        listParentChildRelations: () =>
          Effect.succeed([
            {
              childThreadId: "child-1" as ThreadId,
              parentThreadId: "parent-1" as ThreadId,
            },
          ]),
      },
    });
    const count = await Effect.runPromise(sweeper.sweepOnce(NOW));
    expect(count).toBe(1);
    expect(dispatched).toEqual(["child-1"]);
  });

  it("does NOT settle a non-terminal child of an UN-settled parent — the 48h/terminal rule still governs", async () => {
    for (const parentOverride of [null, "active"] as const) {
      const { sweeper, dispatched } = makeSweeper(parentOverride);
      const count = await Effect.runPromise(sweeper.sweepOnce(NOW));
      expect(count).toBe(0);
      expect(dispatched).toEqual([]);
    }
  });

  it("a parent that un-settles stops force-settling its children on the following sweep", async () => {
    let parentSettled = true;
    const dispatched: string[] = [];
    const sweeper = makeChildSettleSweeper({
      engine: {
        dispatch: (command) =>
          Effect.sync(() => dispatched.push(command.threadId as string)).pipe(
            Effect.as({ sequence: 0 }),
          ),
      },
      query: {
        getShellSnapshot: () =>
          Effect.succeed({
            threads: [
              // thread.unsettled lands settledOverride "active" (user) or null (activity)
              { ...shellOf("parent-1"), settledOverride: parentSettled ? "settled" : "active" },
              idleChild(),
            ],
          }),
        listParentChildRelations: () =>
          Effect.succeed([
            {
              childThreadId: "child-1" as ThreadId,
              parentThreadId: "parent-1" as ThreadId,
            },
          ]),
      },
    });
    expect(await Effect.runPromise(sweeper.sweepOnce(NOW))).toBe(1); // pass 1: parent settled → child settles
    parentSettled = false; // the parent woke back up and is working again
    expect(await Effect.runPromise(sweeper.sweepOnce(NOW))).toBe(0); // pass 2: no force-settle
    expect(dispatched).toEqual(["child-1"]); // exactly one settle, ever
  });

  it("a terminal-but-fresh child of an un-settled parent stays out until the 48h TTL", async () => {
    // Terminal (idle session, completed turn) but only 24h old: without a
    // settled parent the TTL rule is the only path, and it is not due yet.
    const dispatched: string[] = [];
    const sweeper = makeChildSettleSweeper({
      engine: {
        dispatch: (command) =>
          Effect.sync(() => dispatched.push(command.threadId as string)).pipe(
            Effect.as({ sequence: 0 }),
          ),
      },
      query: {
        getShellSnapshot: () =>
          Effect.succeed({
            threads: [
              shellOf("parent-1"), // un-settled parent
              shellOf("child-1", {
                session: { status: "idle" },
                latestTurn: { state: "completed" },
                updatedAt: "2026-01-31T00:00:00.000Z", // 24h: under the TTL
              }),
            ],
          }),
        listParentChildRelations: () =>
          Effect.succeed([
            {
              childThreadId: "child-1" as ThreadId,
              parentThreadId: "parent-1" as ThreadId,
            },
          ]),
      },
    });
    const count = await Effect.runPromise(sweeper.sweepOnce(NOW));
    expect(count).toBe(0);
    expect(dispatched).toEqual([]);
  });

  it("the decide-time precondition wins the race: a parent that un-settles between the snapshot read and the decision is not settled", async () => {
    // The fake engine emulates the decider: at DECIDE time it consults the
    // parent's CURRENT settled state (the read model), not the sweep's
    // snapshot. The snapshot is frozen "settled" (it was read before the
    // parent un-settled), while `parentSettledAtDecideTime` — what the
    // decider sees — is already false: the un-settle landed between the
    // snapshot read and the decision.
    let parentSettledAtDecideTime = false;
    const attempted: FakeCommand[] = [];
    const settled: string[] = [];
    const sweeper = makeChildSettleSweeper({
      engine: {
        dispatch: (command) =>
          Effect.sync(() => {
            if (command.type !== "thread.settle") throw new Error("unexpected command");
            attempted.push({
              threadId: command.threadId as string,
              requireSettledParentThreadId: command.requireSettledParentThreadId as
                | string
                | undefined,
            });
            if (command.requireSettledParentThreadId !== undefined && !parentSettledAtDecideTime) {
              throw new Error("settle blocked: parent is no longer settled at decide time");
            }
            settled.push(command.threadId as string);
            return { sequence: 0 };
          }).pipe(Effect.as({ sequence: 0 })),
      },
      query: {
        // Stale on purpose: read while the parent was still settled.
        getShellSnapshot: () =>
          Effect.succeed({
            threads: [{ ...shellOf("parent-1"), settledOverride: "settled" }, idleChild()],
          }),
        listParentChildRelations: () =>
          Effect.succeed([
            {
              childThreadId: "child-1" as ThreadId,
              parentThreadId: "parent-1" as ThreadId,
            },
          ]),
      },
    });
    // Pass 1: the stale snapshot nominates the child, the decide-time
    // precondition refuses it (and the sweep backoff-blocks the child for
    // the retry window).
    expect(await Effect.runPromise(sweeper.sweepOnce(NOW))).toBe(1); // nominated
    expect(attempted).toEqual([{ threadId: "child-1", requireSettledParentThreadId: "parent-1" }]);
    expect(settled).toEqual([]); // never settled
    // Pass 2 (still inside the retry block, parent still un-settled): not even re-nominated.
    expect(await Effect.runPromise(sweeper.sweepOnce(NOW + 60_000))).toBe(0);
    // Pass 3 (retry block elapsed, parent now settled at decide time again): settles.
    parentSettledAtDecideTime = true;
    const retryBlockMs = childSettleRetryBlockMs();
    expect(await Effect.runPromise(sweeper.sweepOnce(NOW + retryBlockMs))).toBe(1);
    expect(settled).toEqual(["child-1"]); // exactly once, only when the parent still is settled
  });

  it("a blocked child is not re-nominated on every pass — the retry block suppresses re-receipts", async () => {
    // A decider that refuses forever (e.g. an open blocking request the
    // child must resolve itself). Without the retry block, every 5-minute
    // pass would burn a warning, a failure metric and a persisted rejected
    // receipt (receipts key on commandId; the sweep mints a fresh one each
    // pass), unbounded.
    let attempts = 0;
    const sweeper = makeChildSettleSweeper({
      engine: {
        dispatch: () =>
          Effect.sync(() => {
            attempts += 1;
            throw new Error("thread cannot be settled: pending user-input request");
          }).pipe(Effect.as({ sequence: 0 })),
      },
      query: {
        getShellSnapshot: () =>
          Effect.succeed({
            threads: [{ ...shellOf("parent-1"), settledOverride: "settled" }, idleChild()],
          }),
        listParentChildRelations: () =>
          Effect.succeed([
            {
              childThreadId: "child-1" as ThreadId,
              parentThreadId: "parent-1" as ThreadId,
            },
          ]),
      },
    });
    const retryBlockMs = childSettleRetryBlockMs();
    const sweepAt = (nowMs: number) => Effect.runPromise(sweeper.sweepOnce(nowMs));
    expect(await sweepAt(NOW)).toBe(1); // pass 1: one attempt
    expect(attempts).toBe(1);
    // Four more 5-minute passes inside the retry block: zero attempts.
    for (const offset of [300_000, 900_000, 1_500_000, 2_100_000]) {
      expect(await sweepAt(NOW + offset)).toBe(0);
    }
    expect(attempts).toBe(1);
    // After the block elapses, the sweep retries.
    expect(await sweepAt(NOW + retryBlockMs)).toBe(1);
    expect(attempts).toBe(2);
  });

  it("every settle the sweep dispatches stamps requireNoLiveBackgroundLiveness — settled-parent and TTL alike", async () => {
    // The gate is unconditional by design: a server-driven settle must never
    // settle a thread with live background work AT DECIDE TIME, under either
    // rule. No observation is carried (there is nothing to age out of the
    // gate) — the engine re-reads the live registry when it decides.
    const { sweeper: settledParentSweeper, dispatched: settledParentDispatched } =
      makeSweeper("settled");
    expect(await Effect.runPromise(settledParentSweeper.sweepOnce(NOW))).toBe(1);
    expect(settledParentDispatched[0]!.requireNoLiveBackgroundLiveness).toBe(true);

    const ttlCommands: unknown[] = [];
    const ttlSweeper = makeChildSettleSweeper({
      engine: {
        dispatch: (command) =>
          Effect.sync(() => {
            if (command.requireNoLiveBackgroundLiveness !== true) {
              throw new Error("liveness gate must be stamped on every server-driven settle");
            }
            if (command.requireSettledParentThreadId !== undefined) {
              throw new Error("precondition must not be attached to TTL settles");
            }
            ttlCommands.push(command.threadId);
          }).pipe(Effect.as({ sequence: 0 })),
      },
      query: {
        getShellSnapshot: () =>
          Effect.succeed({
            threads: [shellOf("parent-1"), shellOf("child-1")], // un-settled parent, old terminal child
          }),
        listParentChildRelations: () =>
          Effect.succeed([
            {
              childThreadId: "child-1" as ThreadId,
              parentThreadId: "parent-1" as ThreadId,
            },
          ]),
      },
    });
    expect(await Effect.runPromise(ttlSweeper.sweepOnce(NOW))).toBe(1);
    expect(ttlCommands).toEqual(["child-1"]);
  });

  it("a child settled by another path drops its backoff entry — the map is bounded by candidacy", async () => {
    // Pass 1 blocks (backoff set for the retry window). Pass 2: the child
    // was settled through the user path — its entry must be dropped even
    // though the block has not elapsed. Pass 3: the user un-settled the
    // child again (re-wedged); the sweep retries IMMEDIATELY — the leaked
    // entry would have kept it blocked for the whole original window.
    let childSettled = false;
    let allowSettle = false;
    let attempts = 0;
    const sweepAt = async (nowMs: number) => Effect.runPromise(sweeper.sweepOnce(nowMs));
    const sweeper = makeChildSettleSweeper({
      engine: {
        dispatch: () =>
          Effect.sync(() => {
            attempts += 1;
            if (!allowSettle) throw new Error("blocked: open blocking request");
          }).pipe(Effect.as({ sequence: 0 })),
      },
      query: {
        getShellSnapshot: () =>
          Effect.succeed({
            threads: [
              { ...shellOf("parent-1"), settledOverride: "settled" },
              { ...idleChild(), settledOverride: childSettled ? "settled" : null },
            ],
          }),
        listParentChildRelations: () =>
          Effect.succeed([
            {
              childThreadId: "child-1" as ThreadId,
              parentThreadId: "parent-1" as ThreadId,
            },
          ]),
      },
    });
    expect(await sweepAt(NOW)).toBe(1); // attempt 1, blocked → backoff set
    expect(attempts).toBe(1);
    childSettled = true; // settled through the user path
    expect(await sweepAt(NOW + 60_000)).toBe(0); // no candidate; entry dropped
    childSettled = false; // user un-settled: wedged again
    allowSettle = true;
    // Well inside the original one-hour block: the retry happens anyway.
    expect(await sweepAt(NOW + 120_000)).toBe(1);
    expect(attempts).toBe(2);
  });

  it("startup grace spreads post-restart attempts across passes — no boot burst", async () => {
    // Fresh boot (startedAtMs = NOW), four idle children under a settled
    // parent. Within the grace window (4 passes) each child dispatches only
    // in its stable phase slot; after the grace, every pass is full.
    const children = ["boot-1", "boot-2", "boot-3", "boot-4"];
    const swept: string[] = [];
    const shells = [
      { ...shellOf("parent-1"), settledOverride: "settled" },
      ...children.map((id) => idleChildOf(id)),
    ];
    const sweeper = makeChildSettleSweeper(
      {
        engine: {
          dispatch: (command) =>
            Effect.sync(() => swept.push(command.threadId as string)).pipe(
              Effect.as({ sequence: 0 }),
            ),
        },
        query: {
          getShellSnapshot: () => Effect.succeed({ threads: shells }),
          listParentChildRelations: () =>
            Effect.succeed(
              children.map((id) => ({
                childThreadId: id as ThreadId,
                parentThreadId: "parent-1" as ThreadId,
              })),
            ),
        },
      },
      { startedAtMs: NOW },
    );
    const intervalMs = CHILD_SETTLE_SWEEP_INTERVAL_MS;
    for (const slot of [0, 1, 2, 3]) {
      swept.length = 0;
      const nowMs = NOW + slot * intervalMs;
      const expected = children.filter((id) => childSettleAttemptSlot(id, slot));
      expect(await Effect.runPromise(sweeper.sweepOnce(nowMs))).toBe(expected.length);
      expect([...swept].sort()).toEqual(expected.sort());
    }
    // Grace elapsed: the full candidate set dispatches in one pass again.
    swept.length = 0;
    expect(await Effect.runPromise(sweeper.sweepOnce(NOW + 4 * intervalMs))).toBe(4);
    // A frozen clock predating the boot is outside the window: no staggering.
    swept.length = 0;
    const earlySweeper = makeChildSettleSweeper(
      {
        engine: {
          dispatch: (command) =>
            Effect.sync(() => swept.push(command.threadId as string)).pipe(
              Effect.as({ sequence: 0 }),
            ),
        },
        query: {
          getShellSnapshot: () => Effect.succeed({ threads: shells }),
          listParentChildRelations: () =>
            Effect.succeed(
              children.map((id) => ({
                childThreadId: id as ThreadId,
                parentThreadId: "parent-1" as ThreadId,
              })),
            ),
        },
      },
      { startedAtMs: NOW + 1_000 },
    );
    expect(await Effect.runPromise(earlySweeper.sweepOnce(NOW))).toBe(4);
  });
});

describe("child settle sweeper — startup staggering (pure)", () => {
  it("every child has exactly one phase slot across four consecutive passes", () => {
    for (const id of ["a", "child-1", "x-99", "00000000-0000-4000-8000-000000000000"]) {
      const matchingSlots = [0, 1, 2, 3].filter((slot) => childSettleAttemptSlot(id, slot));
      expect(matchingSlots).toHaveLength(1);
    }
  });

  it("is deterministic and stable across calls", () => {
    for (const slot of [0, 1, 2, 3]) {
      expect(childSettleAttemptSlot("child-1", slot)).toBe(childSettleAttemptSlot("child-1", slot));
    }
  });
});

describe("child settle sweeper — env + non-child edges", () => {
  it("honors the env overrides for TTL, cadence and startup grace", () => {
    expect(CHILD_SETTLE_TTL_MS).toBe(48 * 60 * 60 * 1_000);
    expect(CHILD_SETTLE_SWEEP_INTERVAL_MS).toBe(5 * 60 * 1_000);
    expect(CHILD_SETTLE_STARTUP_GRACE_MS).toBe(4 * CHILD_SETTLE_SWEEP_INTERVAL_MS);
    const overrides: ReadonlyArray<[string, string]> = [
      ["T3TEAM_CHILD_SETTLE_TTL_MS", "60000"],
      ["T3TEAM_CHILD_SETTLE_SWEEP_INTERVAL_MS", "30000"],
      ["T3TEAM_CHILD_SETTLE_STARTUP_GRACE_MS", "90000"],
    ];
    const prev: ReadonlyArray<[string, string | undefined]> = overrides.map(([name]) => [
      name,
      process.env[name],
    ]);
    for (const [name, value] of overrides) process.env[name] = value;
    try {
      expect(childSettleTtlMs()).toBe(60_000);
      expect(childSettleSweepIntervalMs()).toBe(30_000);
      expect(childSettleStartupGraceMs()).toBe(90_000);
    } finally {
      for (const [name, value] of prev) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
      expect(childSettleTtlMs()).toBe(CHILD_SETTLE_TTL_MS);
      expect(childSettleStartupGraceMs()).toBe(CHILD_SETTLE_STARTUP_GRACE_MS);
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
