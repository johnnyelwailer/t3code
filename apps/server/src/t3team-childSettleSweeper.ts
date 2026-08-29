// @effect-diagnostics globalTimers:off -- the sweeper owns its host interval
// timer (start is a plain host function, not Effect clock plumbing).
/**
 * Server-side child-settle TTL sweeper (GHE #304 part A) — the Effect
 * dispatch pass and host interval. The pure TTL/terminal-decision layer
 * (constants, `pickSettleSweepCandidates`, `stateOfShell`) lives in
 * `t3team-childSettleSweepDecide` and is re-exported from here so existing
 * imports keep working.
 *
 * Terminal CHILD threads that have sat past the settle TTL become "settled":
 * they keep their full transcripts and drop out of the active rosters. This
 * is the platform backstop; the orchestrator's cleanup pass (the `sweep` op
 * + nudge) is the front line, this sweep catches whatever it misses.
 *
 * Runs at server startup and on an interval. Idempotent: an already-settled
 * thread never re-settles, and a non-terminal — never mind running — thread
 * is a hard skip, so the sweep can never touch a live thread even under a
 * race. Root threads keep the user-facing inactivity settle as their path.
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
};

export const makeChildSettleSweeper = (deps: {
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
      ReadonlyArray<{ readonly childThreadId: string }>,
      ProjectionRepositoryError
    >;
  };
}): ChildSettleSweeper => {
  const sweepOnce = (nowMs: number): Effect.Effect<number, ProjectionRepositoryError> =>
    Effect.gen(function* () {
      const [shells, relations] = yield* Effect.all([
        deps.query.getShellSnapshot(),
        deps.query.listParentChildRelations(),
      ]);
      const childThreadIds = new Set(relations.map((relation) => relation.childThreadId));
      const candidates = pickSettleSweepCandidates(shells.threads, childThreadIds, {
        nowMs,
        ttlMs: childSettleTtlMs(),
      });
      for (const candidate of candidates) {
        yield* deps.engine
          .dispatch({
            type: "thread.settle",
            commandId: CommandId.make(`server:child-settle-sweeper:${t3teamRandomUUID()}`),
            threadId: ThreadId.make(candidate.threadId),
          })
          .pipe(
            Effect.asVoid,
            Effect.catchCause((cause) =>
              Effect.logWarning("child-settle sweeper: settle failed", {
                threadId: candidate.threadId,
                cause: Cause.pretty(cause),
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
              })),
            ),
          ),
      },
    });
    yield* Effect.sync(sweeper.start);
    yield* Effect.addFinalizer(() => Effect.sync(sweeper.stop));
  }),
);
