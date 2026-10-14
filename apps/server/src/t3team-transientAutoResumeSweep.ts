/**
 * Durable half of transient-failure auto-resume (`t3team-transientAutoResume.ts`): a `Scheduler`
 * source (5 s tick) that continues every thread whose armed `transientRecovery` is due, still
 * auto-resuming, and still names the thread's latest run as failed. Due work is derived from the
 * persisted thread record alone, so a restart during a 30-minute wait loses nothing (the
 * counterpart of upstream's `UsageLimitRecoveryWorker`).
 *
 * Each due record is DISARMED (`nextTryAt: null`) before the continuation is dispatched, so a
 * rejected continuation (user message, archive, pending question) can never loop, and a record a
 * newer run superseded drops out of the due query. Command ids carry the armed `nextTryAt`, so a
 * re-armed record (user toggled auto-resume back on) gets fresh receipts.
 *
 * @module t3team-transientAutoResumeSweep
 */
import {
  CommandId,
  type OrchestrationV2AppThread,
  type OrchestrationV2Run,
  type OrchestrationV2ServerCommand,
  type ThreadId,
} from "@t3tools/contracts";
import { latestUnheldRun } from "@t3tools/shared/orchestrationV2ThreadError";
import * as Cause from "effect/Cause";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

import { transientRetryMessageId } from "./t3team-threadTransientTurnRetryPlan.ts";

export interface TransientRecoverySweepDeps {
  readonly enabled: () => boolean;
  /** Threads whose recovery auto-resumes with `nextTryAt <= nowIso` (not archived or deleted). */
  readonly listDue: (nowIso: string) => Effect.Effect<ReadonlyArray<ThreadId>>;
  readonly loadThread: (threadId: ThreadId) => Effect.Effect<{
    readonly thread: Pick<OrchestrationV2AppThread, "transientRecovery"> | null;
    readonly runs: ReadonlyArray<OrchestrationV2Run>;
  }>;
  readonly dispatch: (command: OrchestrationV2ServerCommand) => Effect.Effect<unknown, string>;
}

/** The due query: auto-resuming recoveries whose `nextTryAt` (ISO, UTC) has passed. */
export const listDueTransientRecoveryThreads = (nowIso: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* sql<{ readonly threadId: ThreadId }>`
      SELECT thread_id AS "threadId" FROM orchestration_v2_projection_threads
      WHERE deleted_at IS NULL AND archived_at IS NULL
        AND json_extract(payload_json, '$.transientRecovery.autoResume') = 1
        AND json_extract(payload_json, '$.transientRecovery.nextTryAt') <= ${nowIso}
    `;
    return rows.map((row) => row.threadId);
  });

const dispatchLogged = (deps: TransientRecoverySweepDeps, command: OrchestrationV2ServerCommand) =>
  deps.dispatch(command).pipe(
    Effect.as(true),
    Effect.catchCause((cause) =>
      Cause.hasInterruptsOnly(cause)
        ? Effect.failCause(cause)
        : Effect.logInfo("transient-auto-resume: command not dispatched", {
            commandId: command.commandId,
            cause: Cause.pretty(cause),
          }).pipe(Effect.as(false)),
    ),
  );

/** One pass; returns how many continuations were dispatched. */
export const sweepTransientRecoveries = (deps: TransientRecoverySweepDeps) =>
  Effect.gen(function* () {
    if (!deps.enabled()) return 0;
    const now = yield* DateTime.now;
    let resumed = 0;
    for (const threadId of yield* deps.listDue(DateTime.formatIso(now))) {
      const { thread, runs } = yield* deps.loadThread(threadId);
      const recovery = thread?.transientRecovery;
      if (recovery == null || recovery.nextTryAt === null) continue;
      const identity = `${recovery.runId}:${recovery.nextTryAt}`;
      yield* dispatchLogged(deps, {
        type: "thread.metadata.update",
        commandId: CommandId.make(`server:t3team:transient-disarm:${identity}`),
        threadId,
        transientRecovery: { runId: recovery.runId, nextTryAt: null },
      });
      const latest = latestUnheldRun(runs);
      if (!recovery.autoResume || latest?.id !== recovery.runId || latest.status !== "failed") {
        continue;
      }
      const dispatched = yield* dispatchLogged(deps, {
        type: "message.dispatch",
        commandId: CommandId.make(`server:t3team:transient-retry:${identity}`),
        threadId,
        messageId: transientRetryMessageId(recovery.runId),
        text: "Continue where you left off.",
        attachments: [],
        manualContinuationOfRunId: recovery.runId,
        dispatchMode: { type: "start_immediately" },
        createdBy: "system",
        creationSource: "server",
      });
      if (dispatched) resumed += 1;
    }
    return resumed;
  });
