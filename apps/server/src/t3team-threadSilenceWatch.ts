/**
 * Thread silence watchdog (GHE #63) - shared types and pure helpers. A
 * coordinator registers a silence WATCH on another thread with a
 * per-subscription timeout; the sweeper emits a `thread.silent` notification
 * when the target has been silent for that duration. The payload carries the
 * pending-tool distinction (silence WITH an in-progress tool is a legitimate
 * long op; silence with NONE is the stuck signal). Re-emit fires at each
 * multiple of the timeout while silent. The complementary thread-stopped
 * trigger notifies the watcher once when the target reaches a terminal state.
 * Durable surface: registration/cancel are persisted activities on the
 * WATCHING thread, and each emission appends a `thread_silence.detected`
 * activity plus an actor message there.
 *
 * @module t3team-threadSilenceWatch
 */
import type { OrchestrationEvent } from "@t3tools/contracts";

export const THREAD_SILENCE_WATCH_REGISTERED_KIND = "t3team.thread_silence.watch.registered";
export const THREAD_SILENCE_WATCH_CANCELLED_KIND = "t3team.thread_silence.watch.cancelled";
export const THREAD_SILENCE_DETECTED_KIND = "t3team.thread_silence.detected";
/**
 * Durable "already reported terminal" marker for a watch (shared
 * terminal-notify dedup ledger, GHE #157): appended on the WATCHING thread,
 * payload `{ dedupKey, resumeThreadId, eventSequence, watchId, targetThreadId,
 * stoppedStatus }`.
 */
export const SILENCE_WATCH_TERMINAL_NOTIFIED_KIND = "t3team.thread_silence.watch_terminal_notified";

/** Default per-subscription timeout: 15 minutes (the issue's QA-child example). */
export const THREAD_SILENCE_DEFAULT_TIMEOUT_MS = 900_000;

/** The sweeper's host-timer tick interval; a breach is detected within one tick. */
export const THREAD_SILENCE_SWEEP_INTERVAL_MS = 5_000;

export interface ThreadSilenceWatchRecord {
  readonly watchId: string;
  /** The thread that subscribed (receives the notification). */
  readonly watcherThreadId: string;
  /** The thread being watched for silence. */
  readonly targetThreadId: string;
  readonly targetTitle: string;
  /** Per-subscription timeout in ms. */
  readonly timeoutMs: number;
}

export type ThreadSilenceReason = "silent" | "stopped";

/** The payload of the emitted `thread.silent` event (durable activity + actor message). */
export interface ThreadSilenceDetectedPayload {
  readonly watchId: string;
  readonly targetThreadId: string;
  readonly targetTitle: string;
  readonly reason: ThreadSilenceReason;
  /** ISO timestamp of the target's last activity (silent) or stop time (stopped). */
  readonly silentSinceIso: string;
  /** How long the target has been quiet (ms). */
  readonly silentForMs: number;
  readonly timeoutMs: number;
  /**
   * TRUE when the target had an in-progress tool call at breach time - a
   * legitimate long operation (lower severity). FALSE = the real stuck signal.
   */
  readonly pendingToolCall: boolean;
  readonly pendingToolCount: number;
  /** Terminal session status (or "deleted"); present for `reason: "stopped"` only. */
  readonly stoppedStatus?: string;
}

// ── Watch event parsing (pure, shared by the live reactor and rehydration) ──

/**
 * The lifecycle action a persisted `thread.activity-appended` event carries
 * for the silence watchdog, or null when the event is not a watch event.
 */
export type ThreadSilenceWatchEventAction =
  | { readonly type: "registered"; readonly record: ThreadSilenceWatchRecord }
  | {
      readonly type: "cancelled";
      readonly watcherThreadId: string;
      readonly targetThreadId: string;
    };

export function parseThreadSilenceWatchEvent(
  event: OrchestrationEvent,
): ThreadSilenceWatchEventAction | null {
  if (event.type !== "thread.activity-appended") return null;
  const payload = event.payload as {
    readonly threadId?: string;
    readonly activity?: { readonly kind?: string; readonly payload?: unknown };
  };
  const watcherThreadId = payload.threadId;
  const activity = payload.activity;
  if (watcherThreadId === undefined || activity === undefined) return null;
  if (activity.kind === THREAD_SILENCE_WATCH_REGISTERED_KIND) {
    const p = activity.payload as
      | {
          readonly watchId?: unknown;
          readonly targetThreadId?: unknown;
          readonly targetTitle?: unknown;
          readonly timeoutMs?: unknown;
        }
      | null
      | undefined;
    if (!p || typeof p.watchId !== "string" || typeof p.targetThreadId !== "string") return null;
    const timeoutMs =
      typeof p.timeoutMs === "number" && Number.isFinite(p.timeoutMs) && p.timeoutMs > 0
        ? Math.floor(p.timeoutMs)
        : THREAD_SILENCE_DEFAULT_TIMEOUT_MS;
    return {
      type: "registered",
      record: {
        watchId: p.watchId,
        watcherThreadId,
        targetThreadId: p.targetThreadId,
        targetTitle: typeof p.targetTitle === "string" ? p.targetTitle : "thread",
        timeoutMs,
      },
    };
  }
  if (activity.kind === THREAD_SILENCE_WATCH_CANCELLED_KIND) {
    const p = activity.payload as { readonly targetThreadId?: unknown } | null | undefined;
    if (!p || typeof p.targetThreadId !== "string") return null;
    return { type: "cancelled", watcherThreadId, targetThreadId: p.targetThreadId };
  }
  return null;
}

// ── Breach / re-notify predicates (pure) ────────────────────────────────────

/** Has the target been silent for at least the subscription's timeout? */
export function isSilentBreach(input: {
  readonly lastActivityAtMs: number;
  readonly nowMs: number;
  readonly timeoutMs: number;
}): boolean {
  return input.nowMs - input.lastActivityAtMs >= input.timeoutMs;
}

/**
 * Re-emit policy: fire immediately when never notified; afterwards only at
 * each multiple of the timeout (documented in the module docs).
 */
export function isReNotifyDue(input: {
  readonly lastNotifiedAtMs: number | undefined;
  readonly nowMs: number;
  readonly timeoutMs: number;
}): boolean {
  if (input.lastNotifiedAtMs === undefined) return true;
  return input.nowMs - input.lastNotifiedAtMs >= input.timeoutMs;
}

// ── Emitted-event payload + message text (pure) ─────────────────────────────

export function buildSilenceDetectedPayload(input: {
  readonly watch: ThreadSilenceWatchRecord;
  readonly reason: ThreadSilenceReason;
  readonly silentSinceIso: string;
  readonly silentForMs: number;
  readonly pendingToolCall: boolean;
  readonly pendingToolCount: number;
  readonly stoppedStatus?: string;
}): ThreadSilenceDetectedPayload {
  return {
    watchId: input.watch.watchId,
    targetThreadId: input.watch.targetThreadId,
    targetTitle: input.watch.targetTitle,
    reason: input.reason,
    silentSinceIso: input.silentSinceIso,
    silentForMs: input.silentForMs,
    timeoutMs: input.watch.timeoutMs,
    pendingToolCall: input.pendingToolCall,
    pendingToolCount: input.pendingToolCount,
    ...(input.stoppedStatus !== undefined ? { stoppedStatus: input.stoppedStatus } : {}),
  };
}

function formatDuration(ms: number): string {
  if (ms < 1_000) return `${Math.max(1, Math.round(ms))}ms`;
  if (ms < 60_000) return `${Math.round(ms / 1_000)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1_000);
  return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
}

export function buildSilenceMessageText(payload: ThreadSilenceDetectedPayload): string {
  const quiet = formatDuration(payload.silentForMs);
  const timeout = formatDuration(payload.timeoutMs);
  if (payload.reason === "stopped") {
    return (
      `[Thread stopped] «${payload.targetTitle}» (thread ${payload.targetThreadId}) reached a ` +
      `terminal state (${payload.stoppedStatus ?? "unknown"}) while you were watching it for ` +
      `silence (watch ${payload.watchId}). The watch is closed.`
    );
  }
  const toolNote = payload.pendingToolCall
    ? `A tool call was still in progress (${payload.pendingToolCount} open) - a long operation may be legitimate.`
    : `No tool call was in progress - the thread may be wedged.`;
  return (
    `[Thread silent] «${payload.targetTitle}» (thread ${payload.targetThreadId}) has had no ` +
    `activity for ${quiet} (watch timeout ${timeout}, watch ${payload.watchId}). ${toolNote} ` +
    `Decide whether to nudge, stop, or re-dispatch it; you will be re-notified at each multiple ` +
    `of the timeout while it stays silent.`
  );
}
