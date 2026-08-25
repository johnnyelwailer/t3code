/**
 * Emission side-effects for the thread silence watchdog (GHE #63): the
 * `thread.silent` notification paths (silence breach + thread stopped) and
 * the registration side-effects (index the watch, resolve immediately when
 * the target is already gone/terminal, seed the activity state from the
 * shell's persisted `updatedAt` on rehydration). Each emission dispatches an
 * actor message on the WATCHING thread (drives the watching agent) plus a
 * durable `t3team.thread_silence.detected` activity there (the audit trail).
 *
 * @module t3team-threadSilenceWatchEmit
 */
import {
  CommandId,
  EventId,
  MessageId,
  NonNegativeInt,
  ProjectId,
  ThreadId,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { type OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.ts";
import { type ProjectionSnapshotQueryShape } from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import { type ThreadSilenceActivityState } from "./orchestration/ThreadSilenceWatchdog.ts";
import { sessionStatusToWaitOutcome } from "./t3team-childWait.ts";
import { t3teamRandomUUID } from "./t3team-random.ts";
import {
  buildSilenceDetectedPayload,
  buildSilenceMessageText,
  THREAD_SILENCE_DETECTED_KIND,
  type ThreadSilenceDetectedPayload,
  type ThreadSilenceWatchRecord,
} from "./t3team-threadSilenceWatch.ts";
import { type ThreadSilenceWatchIndex } from "./t3team-threadSilenceWatchIndex.ts";

interface ThreadShellLike {
  readonly id: ThreadId;
  readonly projectId: ProjectId;
  readonly title: string;
  readonly updatedAt: string;
  readonly session?: { readonly status?: string } | null;
}

export interface ThreadSilenceWatchEmitterDeps {
  readonly engine: OrchestrationEngineShape;
  readonly query: ProjectionSnapshotQueryShape;
  readonly index: ThreadSilenceWatchIndex;
  readonly getActivityState: (threadId: string) => ThreadSilenceActivityState | undefined;
  readonly seedActivity: (threadId: string, lastActivityAtMs: number) => void;
}

export interface ThreadSilenceWatchEmitter {
  /** The sweep path: silence breach on a live target. */
  readonly emitSilence: (record: ThreadSilenceWatchRecord, nowMs: number) => Effect.Effect<void>;
  /**
   * The thread-stopped path: the target left a terminal state (or was
   * deleted) while watches were open - notify once per watch, then close.
   */
  readonly resolveStopped: (targetThreadId: string, stoppedStatus: string) => Effect.Effect<void>;
  /**
   * Index a newly registered watch; resolve immediately when the target is
   * already gone or terminal; otherwise seed the activity state from the
   * shell's persisted `updatedAt` when no live state exists yet.
   */
  readonly onRegistered: (record: ThreadSilenceWatchRecord) => Effect.Effect<void>;
}

export const makeThreadSilenceWatchEmitter = (
  deps: ThreadSilenceWatchEmitterDeps,
): ThreadSilenceWatchEmitter => {
  const emitDetected = (
    record: ThreadSilenceWatchRecord,
    payload: ThreadSilenceDetectedPayload,
    nowIso: string,
  ): Effect.Effect<void> =>
    Effect.gen(function* () {
      const target = Option.getOrUndefined(
        yield* deps.query
          .getThreadShellById(ThreadId.make(record.targetThreadId))
          .pipe(Effect.orElseSucceed(() => Option.none())),
      ) as ThreadShellLike | null | undefined;
      const text = buildSilenceMessageText(payload);
      yield* deps.engine
        .dispatch({
          type: "thread.actor.message",
          commandId: CommandId.make(
            `server:t3team:thread-silence:${record.watchId}:${t3teamRandomUUID()}`,
          ),
          threadId: ThreadId.make(record.watcherThreadId),
          messageId: MessageId.make(t3teamRandomUUID()),
          fromThreadId: ThreadId.make(record.targetThreadId),
          fromTitle: target?.title ?? record.targetTitle,
          fromProjectId: target ? target.projectId : ProjectId.make(record.watcherThreadId),
          text,
          urgency: "normal",
          hopCount: NonNegativeInt.make(0),
          rootThreadId: ThreadId.make(record.watcherThreadId),
          createdAt: nowIso,
        })
        .pipe(
          Effect.catchCause((cause) =>
            Effect.logWarning("thread-silence actor message failed", {
              watchId: record.watchId,
              cause: Cause.pretty(cause),
            }),
          ),
        );
      yield* deps.engine
        .dispatch({
          type: "thread.activity.append",
          commandId: CommandId.make(
            `server:t3team:thread-silence:${record.watchId}:${t3teamRandomUUID()}`,
          ),
          threadId: ThreadId.make(record.watcherThreadId),
          activity: {
            id: EventId.make(t3teamRandomUUID()),
            tone: "info",
            kind: THREAD_SILENCE_DETECTED_KIND,
            summary:
              payload.reason === "stopped"
                ? `Watched thread stopped: ${record.targetTitle}`
                : `Watched thread silent: ${record.targetTitle}`,
            payload,
            turnId: null,
            createdAt: nowIso,
          },
          createdAt: nowIso,
        })
        .pipe(
          Effect.catchCause((cause) =>
            Effect.logWarning("thread-silence detected activity failed", {
              watchId: record.watchId,
              cause: Cause.pretty(cause),
            }),
          ),
        );
    });

  const emitSilence = (record: ThreadSilenceWatchRecord, nowMs: number): Effect.Effect<void> =>
    Effect.gen(function* () {
      const state = deps.getActivityState(record.targetThreadId);
      if (state === undefined) return; // resolved/cleared between tick and emit
      const nowIso = DateTime.formatIso(DateTime.makeUnsafe(nowMs));
      const payload = buildSilenceDetectedPayload({
        watch: record,
        reason: "silent",
        silentSinceIso: DateTime.formatIso(DateTime.makeUnsafe(state.lastActivityAtMs)),
        silentForMs: nowMs - state.lastActivityAtMs,
        pendingToolCall: state.pendingToolCount > 0,
        pendingToolCount: state.pendingToolCount,
      });
      yield* emitDetected(record, payload, nowIso);
    });

  const resolveStopped = (targetThreadId: string, stoppedStatus: string): Effect.Effect<void> =>
    Effect.gen(function* () {
      const records = deps.index.forTarget(targetThreadId);
      if (records.length === 0) return;
      const nowMs = DateTime.nowUnsafe().epochMilliseconds;
      const nowIso = DateTime.formatIso(DateTime.nowUnsafe());
      for (const record of records) {
        const state = deps.getActivityState(targetThreadId);
        const payload = buildSilenceDetectedPayload({
          watch: record,
          reason: "stopped",
          silentSinceIso: nowIso,
          silentForMs: state !== undefined ? Math.max(0, nowMs - state.lastActivityAtMs) : 0,
          pendingToolCall: (state?.pendingToolCount ?? 0) > 0,
          pendingToolCount: state?.pendingToolCount ?? 0,
          stoppedStatus,
        });
        yield* emitDetected(record, payload, nowIso);
        deps.index.remove(record.watchId);
      }
    });

  const onRegistered = (record: ThreadSilenceWatchRecord): Effect.Effect<void> =>
    Effect.gen(function* () {
      deps.index.add(record);
      const shell = Option.getOrUndefined(
        yield* deps.query
          .getThreadShellById(ThreadId.make(record.targetThreadId))
          .pipe(Effect.orElseSucceed(() => Option.none())),
      ) as ThreadShellLike | null | undefined;
      if (shell === undefined || shell === null) {
        yield* resolveStopped(record.targetThreadId, "deleted");
        return;
      }
      const status = shell.session?.status;
      if (status !== undefined && sessionStatusToWaitOutcome(status) !== null) {
        yield* resolveStopped(record.targetThreadId, status);
        return;
      }
      const seededAtMs = Date.parse(shell.updatedAt);
      if (!Number.isNaN(seededAtMs)) {
        deps.seedActivity(record.targetThreadId, seededAtMs);
      }
    });

  return { emitSilence, resolveStopped, onRegistered };
};
