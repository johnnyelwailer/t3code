/**
 * Evaluates the open watches of ONE target against its V2 shell and tracked
 * activity: a stopped target reports once per episode and closes its watches, a
 * resting one closes them silently, a live one is checked for a silence breach.
 * Notices go through the shared inter-agent mailbox (sender = the target) with
 * deterministic message ids, so a repeat is a no-op.
 *
 * @module t3team-threadSilenceWatchEvaluate
 */
import {
  MessageId,
  type OrchestratorMcpFailure,
  type OrchestrationV2ThreadShell,
  ThreadId,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import type { ThreadMailboxSendInput } from "./mcp/t3team-threadMailboxDelivery.ts";
import {
  buildSilentNoticeText,
  buildStoppedNoticeText,
  classifySilenceWatchTarget,
  isReNotifyDue,
  isSilentBreach,
  silentNoticeMessageId,
  type SilenceWatchTargetView,
  stoppedNoticeMessageId,
  type ThreadSilenceWatchRecord,
} from "./t3team-threadSilenceWatch.ts";
import type { SilenceActivityTracker } from "./t3team-threadSilenceWatchActivity.ts";
import type { T3TeamThreadSilenceWatchStore } from "./t3team-threadSilenceWatchStore.ts";

export type SilenceWatchShell = SilenceWatchTargetView &
  Pick<OrchestrationV2ThreadShell, "updatedAt">;

export interface ThreadSilenceWatchCoreDeps {
  readonly store: T3TeamThreadSilenceWatchStore["Service"];
  readonly loadShell: (threadId: string) => Effect.Effect<SilenceWatchShell | null>;
  /** The thread's in-progress tool item ids (projection read; seeds a target). */
  readonly loadActiveToolItemIds: (threadId: string) => Effect.Effect<ReadonlyArray<string>>;
  readonly send: (input: ThreadMailboxSendInput) => Effect.Effect<unknown, OrchestratorMcpFailure>;
  readonly newWatchId: () => string;
}

export const makeSilenceWatchEvaluator = (
  deps: ThreadSilenceWatchCoreDeps,
  tracker: SilenceActivityTracker,
  /** Targets with an open watch; kept in step with what the evaluation closes. */
  watchedTargets: Set<string>,
) => {
  const notice = (
    record: ThreadSilenceWatchRecord,
    messageId: string,
    text: string,
    summary: string,
  ) =>
    deps
      .send({
        senderThreadId: ThreadId.make(record.targetThreadId),
        targetThreadId: ThreadId.make(record.watcherThreadId),
        messageId: MessageId.make(messageId),
        text,
        summary: `${summary}: ${record.targetTitle}`,
        urgent: false,
      })
      .pipe(
        // Best effort: a failed notice still advances the watch, so it cannot re-fire every tick.
        Effect.catchCause((cause) =>
          Effect.logWarning("thread silence notice failed", {
            watchId: record.watchId,
            cause: Cause.pretty(cause),
          }),
        ),
      );

  return (
    targetThreadId: string,
    records: ReadonlyArray<ThreadSilenceWatchRecord>,
    nowMs: number,
  ) =>
    Effect.gen(function* () {
      const shell = records.length === 0 ? null : yield* deps.loadShell(targetThreadId);
      const state = classifySilenceWatchTarget(shell);
      if (records.length === 0 || shell === null || state.kind !== "live") {
        for (const record of records) {
          if (state.kind === "stopped") {
            const text = buildStoppedNoticeText(record, state.status);
            const id = stoppedNoticeMessageId(record, state.episode);
            yield* notice(record, id, text, "Watched thread stopped");
          }
          yield* deps.store.remove(record.watchId);
        }
        watchedTargets.delete(targetThreadId);
        tracker.forget(targetThreadId);
        return;
      }
      watchedTargets.add(targetThreadId);
      if (!tracker.isTracked(targetThreadId)) {
        const toolItemIds = yield* deps.loadActiveToolItemIds(targetThreadId);
        tracker.seed(targetThreadId, DateTime.toEpochMillis(shell.updatedAt), toolItemIds);
      }
      const activity = tracker.get(targetThreadId);
      if (activity === undefined) return;
      const { lastActivityAtMs, pendingToolCount } = activity;
      for (const record of records) {
        const { timeoutMs, lastNotifiedAtMs } = record;
        if (!isSilentBreach({ lastActivityAtMs, nowMs, timeoutMs })) continue;
        if (!isReNotifyDue({ lastNotifiedAtMs, nowMs, timeoutMs })) continue;
        const notifyCount = record.notifyCount + 1;
        const silentForMs = nowMs - lastActivityAtMs;
        const text = buildSilentNoticeText(record, { silentForMs, pendingToolCount });
        const id = silentNoticeMessageId(record.watchId, notifyCount);
        yield* notice(record, id, text, "Watched thread silent");
        yield* deps.store.markNotified({ watchId: record.watchId, notifyCount, atMs: nowMs });
      }
    });
};
