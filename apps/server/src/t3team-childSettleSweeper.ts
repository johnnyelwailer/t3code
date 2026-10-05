/**
 * Server-side child-settle sweeper (GHE #304 part A) on V2: settles subagent
 * children through `thread.auto-settle {snapshotAt}` — the stale-snapshot and
 * explicit-override race protection upstream's own settlement sweep relies on.
 * The pure rules (settled-parent rule, TTL rule, live-work skip) live in
 * `t3team-childSettleSweepDecide`.
 *
 * Runs on a fork `Scheduler` source (5 s tick) and sweeps every
 * CHILD_SETTLE_SWEEP_INTERVAL_MS, deriving due work from the shell snapshot
 * alone, so it is restart-safe. Each attempt mints a fresh command id
 * (rejected receipts are sticky); a refused child is blocked for
 * CHILD_SETTLE_RETRY_BLOCK_MS so it does not re-receipt every pass, and the
 * startup grace spreads post-restart attempts across passes.
 * @module t3team-childSettleSweeper
 */
import { CommandId, type ThreadId } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Clock from "effect/Clock";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { ThreadManagementService } from "./orchestration-v2/ThreadManagementService.ts";
import * as Scheduler from "./scheduling/Scheduler.ts";
import { forkParked } from "./serverActivation.ts";
import {
  childSettleAttemptSlot,
  childSettleRetryBlockMs,
  childSettleStartupGraceMs,
  childSettleSweepIntervalMs,
  childSettleTtlMs,
  pickSettleSweepCandidates,
  SETTLED_PARENT_SETTLE_COMMAND_PREFIX,
  type SettleSweepCandidate,
  type SettleSweepShell,
  TTL_SETTLE_COMMAND_PREFIX,
} from "./t3team-childSettleSweepDecide.ts";
import { t3teamRandomUUID } from "./t3team-random.ts";

export interface ChildSettleSweeperDeps<E1, E2> {
  readonly listShells: Effect.Effect<ReadonlyArray<SettleSweepShell>, E1>;
  readonly autoSettle: (command: {
    readonly commandId: CommandId;
    readonly threadId: ThreadId;
    readonly snapshotAt: DateTime.Utc;
  }) => Effect.Effect<unknown, E2>;
}

const settleCommandId = (candidate: SettleSweepCandidate, nonce: string) =>
  CommandId.make(
    `${candidate.rule === "settled-parent" ? SETTLED_PARENT_SETTLE_COMMAND_PREFIX : TTL_SETTLE_COMMAND_PREFIX}${nonce}`,
  );

export const makeChildSettleSweeper = <E1, E2>(
  deps: ChildSettleSweeperDeps<E1, E2>,
  config: { readonly startedAtMs: number; readonly nonce?: () => string },
) => {
  const blockedUntilMs = new Map<string, number>();
  const nonce = config.nonce ?? t3teamRandomUUID;
  let lastSweepAtMs: number | null = null;

  /** One pass; returns how many settles it attempted. */
  const sweepOnce = (nowMs: number) =>
    Effect.gen(function* () {
      const shells = yield* deps.listShells;
      const all = pickSettleSweepCandidates(shells, { nowMs, ttlMs: childSettleTtlMs() });
      // Bound the backoff map by candidacy: a child settled elsewhere drops its entry.
      const nominated = new Set<string>(all.map((candidate) => candidate.threadId));
      for (const [threadId, until] of blockedUntilMs) {
        if (!nominated.has(threadId) || nowMs >= until) blockedUntilMs.delete(threadId);
      }
      const interval = childSettleSweepIntervalMs();
      const withinStartupGrace =
        nowMs >= config.startedAtMs && nowMs - config.startedAtMs < childSettleStartupGraceMs();
      const passSlot = Math.floor((nowMs - config.startedAtMs) / interval);
      const candidates = all.filter(
        (candidate) =>
          !blockedUntilMs.has(candidate.threadId) &&
          (!withinStartupGrace || childSettleAttemptSlot(candidate.threadId, passSlot)),
      );
      for (const candidate of candidates) {
        yield* deps
          .autoSettle({
            commandId: settleCommandId(candidate, nonce()),
            threadId: candidate.threadId,
            snapshotAt: candidate.snapshotAt,
          })
          .pipe(
            Effect.catchCause((cause) =>
              Cause.hasInterruptsOnly(cause)
                ? Effect.failCause(cause)
                : Effect.sync(() =>
                    blockedUntilMs.set(candidate.threadId, nowMs + childSettleRetryBlockMs()),
                  ).pipe(
                    Effect.andThen(
                      Effect.logInfo("child-settle sweeper: settle refused", {
                        threadId: candidate.threadId,
                        rule: candidate.rule,
                        cause: Cause.pretty(cause),
                      }),
                    ),
                  ),
            ),
          );
      }
      return candidates.length;
    });

  /** Scheduler entry point: sweeps when the cadence is due. */
  const tick = (nowMs: number) =>
    lastSweepAtMs !== null && nowMs - lastSweepAtMs < childSettleSweepIntervalMs()
      ? Effect.void
      : Effect.sync(() => {
          lastSweepAtMs = nowMs;
        }).pipe(Effect.andThen(sweepOnce(nowMs)), Effect.asVoid);

  return { sweepOnce, tick };
};

export const T3TeamChildSettleSweeperLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const threads = yield* ThreadManagementService;
    const scheduler = yield* Scheduler.Scheduler;
    const sweeper = makeChildSettleSweeper(
      {
        listShells: threads
          .getShellSnapshot({ location: "active" })
          .pipe(Effect.map((snapshot) => snapshot.threads)),
        autoSettle: ({ commandId, threadId, snapshotAt }) =>
          threads.dispatch({ type: "thread.auto-settle", commandId, threadId, snapshotAt }),
      },
      { startedAtMs: yield* Clock.currentTimeMillis },
    );
    yield* forkParked(
      scheduler.register(
        "t3team-child-settle-sweeper",
        Clock.currentTimeMillis.pipe(Effect.flatMap(sweeper.tick)),
      ),
    );
  }),
).pipe(Layer.provide(Scheduler.layer));
