/**
 * Emission orchestration for the thread silence watchdog (GHE #63): the
 * `thread.silent` paths (silence breach + thread stopped) and the registration
 * side-effects (index the watch, resolve immediately when the target is already
 * gone/terminal, seed activity state from the shell's persisted `updatedAt`).
 * Each emission dispatches an actor message on the watching thread plus a
 * durable `t3team.thread_silence.detected` activity. The leaf dispatch lives in
 * {@link emitSilenceDetected}; the stopped resolution (terminal-only notice +
 * canonical coalescing gate) lives in {@link resolveSilenceWatchStopped}.
 *
 * @module t3team-threadSilenceWatchEmit
 */
import { ThreadId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { shouldStopSilenceWatch } from "./t3team-silenceWatchStop.ts";
import {
  buildSilenceDetectedPayload,
  type ThreadSilenceDetectedPayload,
  type ThreadSilenceWatchRecord,
} from "./t3team-threadSilenceWatch.ts";
import { makeTerminalNoticeGate } from "./t3team-terminalNoticeGate.ts";
import { emitSilenceDetected } from "./t3team-threadSilenceWatchEmitDetected.ts";
import { resolveSilenceWatchStopped } from "./t3team-silenceWatchResolveStopped.ts";
import type {
  ThreadShellLike,
  ThreadSilenceWatchEmitter,
  ThreadSilenceWatchEmitterDeps,
} from "./t3team-threadSilenceWatchEmitTypes.ts";

export const makeThreadSilenceWatchEmitter = (
  deps: ThreadSilenceWatchEmitterDeps,
): ThreadSilenceWatchEmitter => {
  const gate = deps.noticeGate ?? makeTerminalNoticeGate();
  const emitDetected = (
    record: ThreadSilenceWatchRecord,
    payload: ThreadSilenceDetectedPayload,
    nowIso: string,
  ) => emitSilenceDetected({ engine: deps.engine, query: deps.query }, record, payload, nowIso);

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

  const resolveStopped = (
    targetThreadId: string,
    stoppedStatus: string,
    triggerSeq: number,
  ): Effect.Effect<void> =>
    resolveSilenceWatchStopped(
      {
        forTarget: (threadId) => deps.index.forTarget(threadId),
        removeWatch: (watchId) => deps.index.remove(watchId),
        dedup: deps.dedup,
        noticeGate: gate,
        getActivityState: deps.getActivityState,
        emitDetected,
      },
      targetThreadId,
      stoppedStatus,
      triggerSeq,
    );

  const onRegistered = (
    record: ThreadSilenceWatchRecord,
    triggerSeq: number,
  ): Effect.Effect<void> =>
    Effect.gen(function* () {
      deps.index.add(record);
      const shell = Option.getOrUndefined(
        yield* deps.query
          .getThreadShellById(ThreadId.make(record.targetThreadId))
          .pipe(Effect.orElseSucceed(() => Option.none())),
      ) as ThreadShellLike | null | undefined;
      // True terminals always resolve immediately; `ready`/`idle` (turn ended,
      // thread alive) only when no background work keeps the target live.
      const status = shell?.session?.status;
      const terminalStatus =
        shell === undefined || shell === null
          ? "deleted"
          : shouldStopSilenceWatch(status, deps.getLiveness?.(record.targetThreadId) ?? null)
            ? (status as string)
            : null;
      if (terminalStatus !== null) {
        yield* resolveStopped(record.targetThreadId, terminalStatus, triggerSeq);
        return;
      }
      const seededAtMs = Date.parse(shell!.updatedAt);
      if (!Number.isNaN(seededAtMs)) {
        deps.seedActivity(record.targetThreadId, seededAtMs);
      }
    });

  return { emitSilence, resolveStopped, onRegistered };
};
