// @effect-diagnostics globalDate:off -- host wall-clock for sweep cadence, not Effect Clock.
// @effect-diagnostics globalTimers:off -- the sweeper owns its host interval
// timer (start is a plain host function, not Effect clock plumbing).
/**
 * Server-side child-settle sweeper (GHE #304 part A) — the Effect dispatch
 * pass and host interval. The pure decision layer (constants,
 * `pickSettleSweepCandidates`, `stateOfShell`) lives in
 * `t3team-childSettleSweepDecide` and is re-exported from here so existing
 * imports keep working.
 *
 * Two rules settle a CHILD (see the decide module): a child of a parent
 * that is settled at sweep time settles immediately, regardless of the
 * child's terminality and the TTL; and terminal children that have sat past
 * the settle TTL settle the usual way. Settled children keep their full
 * transcripts and drop out of the active rosters. This is the platform
 * backstop; the orchestrator's cleanup pass (the `sweep` op + nudge) is the
 * front line, this sweep catches whatever it misses.
 *
 * Runs at server startup and on an interval. Idempotent: an already-settled
 * thread never re-settles. Live protection is layered: the decide layer
 * hard-skips running/background-liveness children, the decider refuses
 * settles for a thread whose session is coming alive or that has open
 * blocking work, and server-driven settles never tear down provider
 * sessions. Settled-parent settles carry `requireSettledParentThreadId`, so
 * a parent that un-settles between the snapshot read and the decision wins
 * the race; a blocked or failed settle is not re-nominated for
 * CHILD_SETTLE_RETRY_BLOCK_MS. Every settle the sweep dispatches also
 * stamps `requireNoLiveBackgroundLiveness`, so the engine re-checks the
 * LIVE background-liveness registry at decide time — work that starts while
 * the command sits in the queue still blocks the settle, and a snapshot can
 * never age that gate out (there is no observation to age). Stranded
 * registry entries cannot pin a child forever: the liveness source bounds
 * them (ThreadBackgroundLiveness, #475).
 * After a restart, CHILD_SETTLE_STARTUP_GRACE_MS spreads attempts across
 * passes so the wiped backoff map cannot re-fire everything in one burst.
 *
 * @module t3team-childSettleSweeper
 */
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { CommandId, ThreadId } from "@t3tools/contracts";
import { OrchestrationEngineService } from "./orchestration/Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import { type OrchestrationDispatchError } from "./orchestration/Errors.ts";
import { type ProjectionRepositoryError } from "./persistence/Errors.ts";
import { t3teamRandomUUID } from "./t3team-random.ts";
import {
  childSettleAttemptSlot,
  childSettleRetryBlockMs,
  childSettleStartupGraceMs,
  childSettleSweepIntervalMs,
  childSettleTtlMs,
  pickSettleSweepCandidates,
  type SettleSweepShellLike,
} from "./t3team-childSettleSweepDecide.ts";

export * from "./t3team-childSettleSweepDecide.ts";

export interface ChildSettleSweeper {
  /** One sweep pass; returns how many settles were dispatched. */
  readonly sweepOnce: (nowMs: number) => Effect.Effect<number, ProjectionRepositoryError>;
  /** Arm the startup pass + the host interval. Plain host function. */
  readonly start: () => void;
  readonly stop: () => void;
}

type SettleCommand = {
  readonly type: "thread.settle";
  readonly commandId: ReturnType<typeof CommandId.make>;
  readonly threadId: ReturnType<typeof ThreadId.make>;
  readonly requireSettledParentThreadId?: ReturnType<typeof ThreadId.make>;
  readonly requireNoLiveBackgroundLiveness?: boolean;
};

export const makeChildSettleSweeper = (
  deps: {
    readonly engine: {
      readonly dispatch: (
        command: SettleCommand,
      ) => Effect.Effect<{ readonly sequence: number }, OrchestrationDispatchError>;
    };
    readonly query: {
      readonly getShellSnapshot: () => Effect.Effect<
        { readonly threads: ReadonlyArray<SettleSweepShellLike> },
        ProjectionRepositoryError
      >;
      readonly listParentChildRelations: () => Effect.Effect<
        ReadonlyArray<{ readonly childThreadId: string; readonly parentThreadId: string }>,
        ProjectionRepositoryError
      >;
    };
  },
  config: { readonly startedAtMs?: number } = {},
): ChildSettleSweeper => {
  // Retry cap for blocked/failed settles: a refused child must not burn a
  // warning, a failure metric and a persisted rejected receipt on every
  // 5-minute pass (receipts key on commandId, so fresh ids do not dedupe).
  // In-memory on purpose: a fresh attempt at startup is desirable — and the
  // startup grace below is what keeps that fresh attempt from re-firing
  // every previously-blocked child in one burst after a restart.
  const blockedUntilMs = new Map<string, number>();
  // When this sweeper instance booted (host wall clock). Tests inject a
  // frozen value; a pass whose nowMs predates the boot is outside the
  // startup grace (kept simple on purpose — the grace only ever widens).
  const startedAtMs = config.startedAtMs ?? Date.now();

  const sweepOnce = (nowMs: number): Effect.Effect<number, ProjectionRepositoryError> =>
    Effect.gen(function* () {
      const [shells, relations] = yield* Effect.all([
        deps.query.getShellSnapshot(),
        deps.query.listParentChildRelations(),
      ]);
      // The parent's settled state is read from THIS pass's snapshot: a
      // parent that un-settles stops force-settling its children on the next
      // sweep without extra bookkeeping.
      const settledParentIds = new Set(
        shells.threads
          .filter((thread) => thread.settledOverride === "settled")
          .map((thread) => thread.id),
      );
      const childThreadIds = new Set(relations.map((relation) => relation.childThreadId));
      const settledParentChildren = new Set(
        relations
          .filter((relation) => settledParentIds.has(relation.parentThreadId))
          .map((relation) => relation.childThreadId),
      );
      const parentOfChild = new Map(
        relations.map((relation) => [relation.childThreadId, relation.parentThreadId]),
      );
      // Bound the backoff map: an entry only matters while its child is
      // still nomination-eligible AND the block has not elapsed — a child
      // settled by another path, archived, deleted or un-related stops being
      // a candidate and must not pin an entry forever.
      const nominationEligibleIds = new Set(
        shells.threads
          .filter(
            (thread) =>
              childThreadIds.has(thread.id) &&
              thread.archivedAt === null &&
              thread.settledOverride !== "settled",
          )
          .map((thread) => thread.id),
      );
      for (const [threadId, until] of blockedUntilMs) {
        if (!nominationEligibleIds.has(threadId) || nowMs >= until) {
          blockedUntilMs.delete(threadId);
        }
      }
      // Startup grace: after a restart the backoff map is wiped, so without
      // this the startup pass would re-fire every previously-blocked child
      // in one burst. Within the grace, a stable per-child phase admits each
      // child in ~1 of every STAGGER passes, spreading the attempts.
      const withinStartupGrace =
        nowMs >= startedAtMs &&
        nowMs - startedAtMs < childSettleStartupGraceMs() &&
        childSettleSweepIntervalMs() > 0;
      const passSlot = withinStartupGrace
        ? Math.floor((nowMs - startedAtMs) / childSettleSweepIntervalMs())
        : 0;
      const candidates = pickSettleSweepCandidates(shells.threads, childThreadIds, {
        nowMs,
        ttlMs: childSettleTtlMs(),
        settledParentChildren,
      }).filter((candidate) => {
        const until = blockedUntilMs.get(candidate.threadId);
        if (until !== undefined && nowMs < until) return false;
        return !withinStartupGrace || childSettleAttemptSlot(candidate.threadId, passSlot);
      });
      for (const candidate of candidates) {
        const isSettledParentCandidate = settledParentChildren.has(candidate.threadId);
        const parentThreadId =
          isSettledParentCandidate && parentOfChild.get(candidate.threadId) !== undefined
            ? parentOfChild.get(candidate.threadId)!
            : undefined;
        yield* deps.engine
          .dispatch({
            type: "thread.settle",
            commandId: CommandId.make(`server:child-settle-sweeper:${t3teamRandomUUID()}`),
            threadId: ThreadId.make(candidate.threadId),
            // Precondition only for settled-parent settles: TTL settles of
            // children of UN-settled parents must not require one.
            ...(parentThreadId === undefined
              ? {}
              : { requireSettledParentThreadId: ThreadId.make(parentThreadId) }),
            // Decide-time liveness gate, unconditionally: a server-driven
            // settle must never settle a thread with live background work
            // at decide time. The engine re-reads the live registry — no
            // observation is carried, so nothing can age out of the gate.
            requireNoLiveBackgroundLiveness: true,
          })
          .pipe(
            Effect.flatMap(() => Effect.sync(() => blockedUntilMs.delete(candidate.threadId))),
            Effect.catchCause((cause) =>
              Effect.gen(function* () {
                yield* Effect.sync(() => {
                  blockedUntilMs.set(candidate.threadId, nowMs + childSettleRetryBlockMs());
                });
                yield* Effect.logWarning("child-settle sweeper: settle blocked or failed", {
                  threadId: candidate.threadId,
                  retryBlockMs: childSettleRetryBlockMs(),
                  cause: Cause.pretty(cause),
                });
              }),
            ),
          );
      }
      return candidates.length;
    });

  let timer: ReturnType<typeof setInterval> | undefined;
  const start = (): void => {
    const runSafely = (label: string) =>
      Effect.runFork(
        sweepOnce(Date.now()).pipe(
          Effect.catchCause((cause) =>
            Effect.logWarning(`child-settle sweeper: ${label}`, { cause: Cause.pretty(cause) }),
          ),
        ),
      );
    runSafely("startup sweep failed");
    timer = setInterval(() => runSafely("sweep failed"), childSettleSweepIntervalMs());
  };
  const stop = (): void => {
    if (timer !== undefined) clearInterval(timer);
  };
  return { sweepOnce, start, stop };
};

export const T3TeamChildSettleSweeperLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const engine = yield* OrchestrationEngineService;
    const query = yield* ProjectionSnapshotQuery;
    const sweeper = makeChildSettleSweeper({
      engine: { dispatch: (command) => engine.dispatch(command) },
      query: {
        getShellSnapshot: () =>
          query.getShellSnapshot().pipe(
            Effect.map((snapshot) => ({
              threads: snapshot.threads.map((thread) => ({
                id: thread.id as string,
                title: thread.title,
                updatedAt: thread.updatedAt,
                archivedAt: thread.archivedAt,
                settledOverride: thread.settledOverride,
                session: thread.session,
                latestTurn: thread.latestTurn,
                backgroundLiveness: thread.backgroundLiveness ?? null,
              })),
            })),
          ),
        listParentChildRelations: () =>
          query.listParentChildRelations().pipe(
            Effect.map((relations) =>
              relations.map((relation) => ({
                childThreadId: relation.childThreadId as string,
                parentThreadId: relation.parentThreadId as string,
              })),
            ),
          ),
      },
    });
    yield* Effect.sync(sweeper.start);
    yield* Effect.addFinalizer(() => Effect.sync(sweeper.stop));
  }),
);
