import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import { isTrueTerminalSessionStatus } from "./t3team-silenceWatchStop.ts";
import {
  buildSilenceDetectedPayload,
  type ThreadSilenceDetectedPayload,
  type ThreadSilenceWatchRecord,
} from "./t3team-threadSilenceWatch.ts";
import type { ThreadSilenceActivityState } from "./orchestration/ThreadSilenceWatchdog.ts";
import type { TerminalNotifyLedger } from "./t3team-terminalNotifyDedup.ts";
import type { TerminalNoticeGate } from "./t3team-terminalNoticeGate.ts";

/** Minimal surface the stopped-resolver needs (injected by the emitter). */
export interface SilenceWatchResolveStoppedDeps {
  readonly forTarget: (targetThreadId: string) => ReadonlyArray<ThreadSilenceWatchRecord>;
  readonly removeWatch: (watchId: string) => void;
  readonly dedup: TerminalNotifyLedger;
  readonly noticeGate: TerminalNoticeGate;
  readonly getActivityState: (threadId: string) => ThreadSilenceActivityState | undefined;
  readonly emitDetected: (
    record: ThreadSilenceWatchRecord,
    payload: ThreadSilenceDetectedPayload,
    nowIso: string,
  ) => Effect.Effect<void>;
}

/**
 * Resolve an armed silence watch when its target's session settles.
 *
 * Root-cause fix (GHE #63 / #157 follow-up): `ready`/`idle` is a thread resting
 * between turns, NOT terminal - close the watch silently, with no "reached a
 * terminal state" notice. Only a true terminal (error/interrupted/stopped) or a
 * deleted target notifies the watcher, coalesced by the canonical quiet-window
 * gate so a re-watch of an already-terminal child / a restart re-report does
 * not re-fire within the window. The durable ledger stays the epoch re-arm
 * source of truth (GHE #157, #256/#269 kept intact).
 *
 * @module t3team-silenceWatchResolveStopped
 */
export const resolveSilenceWatchStopped = (
  deps: SilenceWatchResolveStoppedDeps,
  targetThreadId: string,
  stoppedStatus: string,
  triggerSeq: number,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const records = deps.forTarget(targetThreadId);
    if (records.length === 0) return;
    // A ready/idle target is alive between turns: close every armed watch for
    // it without a terminal notice. Only true terminals (and a deleted target)
    // produce the "reached a terminal state" report.
    if (!isTrueTerminalSessionStatus(stoppedStatus)) {
      for (const record of records) deps.removeWatch(record.watchId);
      return;
    }
    const nowMs = DateTime.nowUnsafe().epochMilliseconds;
    const nowIso = DateTime.formatIso(DateTime.nowUnsafe());
    for (const record of records) {
      // Canonical coalescing gate: drop a repeat of this terminal episode for
      // this watcher within the quiet window (re-watch multiples / restart
      // re-report). The first delivery for the episode always passes.
      if (
        !deps.noticeGate.allow({
          recipientThreadId: record.watcherThreadId,
          kind: "terminal",
          episodeId: targetThreadId,
        })
      ) {
        deps.removeWatch(record.watchId);
        continue;
      }
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
      yield* deps.dedup.notify({
        key: record.watchId,
        markerThreadId: record.watcherThreadId,
        resumeThreadId: targetThreadId,
        terminalSeq: triggerSeq,
        markerPayload: { watchId: record.watchId, targetThreadId, stoppedStatus },
        doNotify: deps.emitDetected(record, payload, nowIso),
      });
      deps.removeWatch(record.watchId);
    }
  });
