/**
 * Live layer of the session-level transient-run retry (GHE #306,
 * `t3team-threadTransientTurnRetryReactor.ts`): handles each failed run once per process and,
 * with flag `TRANSIENT_AUTO_RESUME` on, registers the durable auto-resume sweep
 * (`t3team-transientAutoResumeSweep.ts`).
 *
 * @module t3team-threadTransientTurnRetryLive
 */
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/sql/SqlClient";
import * as Stream from "effect/Stream";

import { ThreadManagementService } from "./orchestration-v2/ThreadManagementService.ts";
import * as Scheduler from "./scheduling/Scheduler.ts";
import { forkParked } from "./serverActivation.ts";
import { isTransientAutoResumeEnabled } from "./t3team-transientAutoResumeFlag.ts";
import {
  listDueTransientRecoveryThreads,
  sweepTransientRecoveries,
  type TransientRecoverySweepDeps,
} from "./t3team-transientAutoResumeSweep.ts";
import { TRANSIENT_RETRY_TURN_ITEM_TYPES } from "./t3team-threadTransientTurnRetryOwner.ts";
import { transientTurnRetryDelayMs } from "./t3team-threadTransientTurnRetryPolicy.ts";
import {
  handleTransientRunFailure,
  type TransientRetryDeps,
} from "./t3team-threadTransientTurnRetryReactor.ts";
import { T3TeamThreadMessageRecorder } from "./t3team-v2/t3team-threadMessageRecorder.ts";

const parseBackoffOverride = (raw: string | undefined): number | undefined => {
  if (raw === undefined) return undefined;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export const T3TeamThreadTransientTurnRetryLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const threads = yield* ThreadManagementService;
    const recorder = yield* T3TeamThreadMessageRecorder;
    const scope = yield* Effect.scope;
    const sql = yield* SqlClient.SqlClient;
    const scheduler = yield* Scheduler.Scheduler;
    const backoffOverride = parseBackoffOverride(
      process.env.T3TEAM_TRANSIENT_TURN_RETRY_BACKOFF_MS,
    );
    const deps: TransientRetryDeps = {
      loadRecords: (threadId, runId) =>
        threads
          .getThreadRecords(threadId, ["runs", "turnItems", "messages"], {
            turnItemRunId: runId,
            turnItemTypes: TRANSIENT_RETRY_TURN_ITEM_TYPES,
            messageRunIds: [runId],
            messageRoles: ["user"],
          })
          .pipe(
            Effect.orElseSucceed(() => ({ thread: null, runs: [], turnItems: [], messages: [] })),
          ),
      dispatch: (command) => threads.dispatch(command).pipe(Effect.mapError(String)),
      recordNote: ({ threadId, messageId, text }) =>
        recorder
          .record({ threadId, messageId, role: "system", text })
          .pipe(Effect.mapError(String)),
      delayMs: (attempt, directive, outage) =>
        transientTurnRetryDelayMs(attempt, directive, backoffOverride, Math.random, outage),
      autoResume: () => isTransientAutoResumeEnabled(),
    };
    // A run can be re-published as failed; handle each failed run once per process.
    const handled = new Set<string>();
    yield* forkParked(
      Stream.runForEach(threads.streamDomainEvents, (event) => {
        if (event.type !== "run.updated" || event.payload.status !== "failed") return Effect.void;
        if (handled.has(event.payload.id)) return Effect.void;
        handled.add(event.payload.id);
        return handleTransientRunFailure(deps, {
          threadId: event.threadId,
          runId: event.payload.id,
        }).pipe(Effect.forkIn(scope), Effect.asVoid);
      }).pipe(
        Effect.catchCause((cause) =>
          Cause.hasInterruptsOnly(cause)
            ? Effect.failCause(cause)
            : Effect.logWarning("transient-retry: domain event stream failed", { cause }),
        ),
      ),
    );
    const sweepDeps: TransientRecoverySweepDeps = {
      enabled: () => isTransientAutoResumeEnabled(),
      listDue: (nowIso) =>
        listDueTransientRecoveryThreads(nowIso).pipe(
          Effect.provideService(SqlClient.SqlClient, sql),
          Effect.orElseSucceed(() => []),
        ),
      loadThread: (threadId) =>
        threads
          .getThreadRecords(threadId, ["runs"])
          .pipe(Effect.orElseSucceed(() => ({ thread: null, runs: [] }))),
      dispatch: deps.dispatch,
    };
    yield* forkParked(
      scheduler.register("t3team-transient-auto-resume", sweepTransientRecoveries(sweepDeps)),
    );
  }),
).pipe(Layer.provide(Scheduler.layer));
