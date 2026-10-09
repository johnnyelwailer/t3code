/**
 * Queued-turn stall tracking: a thread whose turn start was requested but
 * never started in the provider (still queued) for longer than
 * QUEUED_TURN_STALL_TIMEOUT_MS. Until now nothing told a delegated child's
 * parent about this: the only parent notices are for TERMINAL session states
 * (t3team-childAbnormalStopNotify.ts), and the provider-session reaper
 * deliberately protects pending turn starts (GHE #343), so a child stuck in
 * the provider queue was silent forever.
 *
 * This module is the pure, replayable part: it folds orchestration events
 * into "pending since" entries (one STALL EPOCH per first unanswered turn
 * request) and the set of epochs already reported. Both are rebuilt from the
 * persisted event log at boot - the `thread.turn-start-requested` event is
 * itself the durable "observed-pending-since" stamp, and the notice marker
 * (QUEUED_TURN_STALL_NOTIFIED_KIND) is the durable "already reported" fact -
 * so a restart neither loses a stall nor re-reports one.
 *
 * Observation only: a stall is NOT a terminal state. Nothing here settles,
 * fails, or reaps the thread; the gateway may still start the turn later.
 *
 * @module t3team-queuedTurnStall
 */
import type { OrchestrationEvent } from "@t3tools/contracts";

/** A queued turn start older than this is reported as stalled (10 minutes). */
export const QUEUED_TURN_STALL_TIMEOUT_MS = 10 * 60_000;
/** Sweep cadence, the same as the silence watchdog's sweeper. */
export const QUEUED_TURN_STALL_SWEEP_INTERVAL_MS = 5_000;
/** Durable "stall reported" marker kind, appended on the stalled thread. */
export const QUEUED_TURN_STALL_NOTIFIED_KIND = "t3team.queued_turn_stall.notified";
/** Older stalls (e.g. replayed on first boot) get the marker only, no parent notice. */
export const QUEUED_TURN_STALL_MAX_NOTIFY_AGE_MS = 24 * 60 * 60_000;
/** Notice subject marking it SERVER-originated (not the child reporting; see childSilentCompletion). */
export const QUEUED_TURN_STALL_NOTICE_TAG = "[Child stalled in provider queue]";

const TERMINAL_STATUSES: ReadonlySet<string> = new Set(["error", "interrupted", "stopped"]);

export interface QueuedTurnStallEntry {
  readonly threadId: string;
  /** Sequence of the turn request that opened this stall epoch (the dedup key). */
  readonly requestSeq: number;
  /**
   * When the turn has been waiting since. `null` while the thread is still
   * running an earlier turn: a request queued behind a live turn is not
   * stalled; its clock starts when that turn ends.
   */
  sinceMs: number | null;
}

export const queuedTurnStallEpochKey = (
  entry: Pick<QueuedTurnStallEntry, "threadId" | "requestSeq">,
) => `${entry.threadId}:${entry.requestSeq}`;

export interface QueuedTurnStallTracker {
  readonly fold: (event: OrchestrationEvent) => void;
  /** Entries pending for at least `timeoutMs` whose epoch is not yet reported. */
  readonly due: (nowMs: number, timeoutMs: number) => ReadonlyArray<QueuedTurnStallEntry>;
  /** Forget a thread's entry (the projection says nothing is pending any more). */
  readonly drop: (threadId: string) => void;
  readonly markNotified: (epochKey: string) => void;
  readonly isNotified: (epochKey: string) => boolean;
}

const parseIsoMs = (iso: string): number => {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? 0 : ms;
};

export function makeQueuedTurnStallTracker(): QueuedTurnStallTracker {
  const pending = new Map<string, QueuedTurnStallEntry>();
  const running = new Set<string>();
  const notified = new Set<string>();

  const fold = (event: OrchestrationEvent): void => {
    switch (event.type) {
      case "thread.turn-start-requested": {
        const threadId = event.payload.threadId;
        // Further requests while one is already queued join the same epoch:
        // the stall is measured from the FIRST unanswered request.
        if (pending.has(threadId)) return;
        pending.set(threadId, {
          threadId,
          requestSeq: event.sequence,
          sinceMs: running.has(threadId) ? null : parseIsoMs(event.payload.createdAt),
        });
        return;
      }
      case "thread.session-set": {
        const threadId = event.payload.threadId;
        const status = event.payload.session.status;
        // Mirror the projection: only `running` WITH an active turn means the
        // queued request was picked up. A provider reporting the still-queued
        // run as running/waiting has no activeTurnId yet - still pending.
        if (status === "running" && event.payload.session.activeTurnId !== null) {
          running.add(threadId);
          pending.delete(threadId);
          return;
        }
        running.delete(threadId);
        // Mirror the projection's own clears (ProjectionPipeline turns
        // projector): terminal sessions and a provider-reported `ready`
        // drop the pending turn start.
        if (
          TERMINAL_STATUSES.has(status) ||
          (status === "ready" &&
            event.commandId?.startsWith("server:provider-session-set:") === true)
        ) {
          pending.delete(threadId);
          return;
        }
        const entry = pending.get(threadId);
        if (entry !== undefined && entry.sinceMs === null)
          entry.sinceMs = parseIsoMs(event.occurredAt);
        return;
      }
      case "thread.activity-appended": {
        const activity = event.payload.activity;
        if (activity.kind === "provider.turn.start.failed") {
          pending.delete(event.payload.threadId);
          return;
        }
        if (activity.kind !== QUEUED_TURN_STALL_NOTIFIED_KIND) return;
        const payload = activity.payload as { readonly epochKey?: unknown } | null | undefined;
        if (typeof payload?.epochKey === "string") notified.add(payload.epochKey);
        return;
      }
      case "thread.deleted":
      case "thread.settled":
        pending.delete(event.payload.threadId);
        running.delete(event.payload.threadId);
        return;
      default:
        return;
    }
  };

  return {
    fold,
    due: (nowMs, timeoutMs) => {
      const due: QueuedTurnStallEntry[] = [];
      for (const entry of pending.values()) {
        if (entry.sinceMs === null || nowMs - entry.sinceMs < timeoutMs) continue;
        if (notified.has(queuedTurnStallEpochKey(entry))) continue;
        due.push(entry);
      }
      return due;
    },
    drop: (threadId) => {
      pending.delete(threadId);
    },
    markNotified: (epochKey) => {
      notified.add(epochKey);
    },
    isNotified: (epochKey) => notified.has(epochKey),
  };
}
