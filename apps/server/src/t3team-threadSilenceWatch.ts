/**
 * Thread silence watch (GHE #63) - shared types and pure rules. A watcher
 * thread registers a watch on another thread with a per-subscription timeout
 * (`t3team_children op:"watch"`); the watcher is told, through the inter-agent
 * mailbox, when the target has been silent for that long (re-notified at each
 * multiple of the timeout while it stays silent) and once when the target
 * stops. Silence WITH an in-progress tool call is a legitimate long operation;
 * silence with none is the stuck signal - the notice says which.
 *
 * @module t3team-threadSilenceWatch
 */
import type { OrchestrationV2ThreadShell } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";

/** Default per-subscription timeout: 15 minutes. */
export const THREAD_SILENCE_DEFAULT_TIMEOUT_MS = 900_000;

export interface ThreadSilenceWatchRecord {
  readonly watchId: string;
  /** The thread that subscribed (receives the notices). */
  readonly watcherThreadId: string;
  readonly targetThreadId: string;
  readonly targetTitle: string;
  readonly timeoutMs: number;
  /** Silent notices sent so far (numbers the deterministic notice ids). */
  readonly notifyCount: number;
  readonly lastNotifiedAtMs: number | null;
}

/** The target shell fields the stop rule reads. */
export type SilenceWatchTargetView = Pick<
  OrchestrationV2ThreadShell,
  "status" | "latestRunId" | "activityRunStatus" | "pendingBackgroundTasks" | "settledAt"
>;

/**
 * - `live`: keep watching for silence;
 * - `resting`: the turn ended normally and nothing keeps the thread busy - the
 *   watch closes without a notice (a thread between turns is not "stopped");
 * - `stopped`: a true terminal fact - the watcher gets one notice per episode.
 */
export type SilenceWatchTargetState =
  | { readonly kind: "live" }
  | { readonly kind: "resting" }
  | { readonly kind: "stopped"; readonly status: string; readonly episode: string };

const STOPPED_RUN_STATUSES: ReadonlySet<string> = new Set(["failed", "interrupted", "cancelled"]);

export function classifySilenceWatchTarget(
  shell: SilenceWatchTargetView | null,
): SilenceWatchTargetState {
  if (shell === null) return { kind: "stopped", status: "deleted", episode: "deleted" };
  const busy =
    shell.activityRunStatus != null ||
    (shell.pendingBackgroundTasks?.length ?? 0) > 0 ||
    shell.latestRunId === null;
  if (busy) return { kind: "live" };
  if (shell.settledAt !== null) {
    return {
      kind: "stopped",
      status: "settled",
      episode: `settled:${DateTime.formatIso(shell.settledAt)}`,
    };
  }
  if (STOPPED_RUN_STATUSES.has(shell.status)) {
    return { kind: "stopped", status: shell.status, episode: `run:${shell.latestRunId}` };
  }
  return shell.status === "completed" || shell.status === "rolled_back" || shell.status === "idle"
    ? { kind: "resting" }
    : { kind: "live" };
}

/** Has the target been silent for at least the subscription's timeout? */
export function isSilentBreach(input: {
  readonly lastActivityAtMs: number;
  readonly nowMs: number;
  readonly timeoutMs: number;
}): boolean {
  return input.nowMs - input.lastActivityAtMs >= input.timeoutMs;
}

/** Fire immediately when never notified; afterwards only at each multiple of the timeout. */
export function isReNotifyDue(input: {
  readonly lastNotifiedAtMs: number | null;
  readonly nowMs: number;
  readonly timeoutMs: number;
}): boolean {
  if (input.lastNotifiedAtMs === null) return true;
  return input.nowMs - input.lastNotifiedAtMs >= input.timeoutMs;
}

/** Deterministic mailbox ids: a re-send after a crash or a repeat sweep is a no-op. */
export const silentNoticeMessageId = (watchId: string, notifyNumber: number) =>
  `t3team-silence:${watchId}:silent:${notifyNumber}`;

/**
 * Keyed on (watcher, target, terminal episode), not the watch id, so re-watching
 * an already-stopped target does not report the same stop twice.
 */
export const stoppedNoticeMessageId = (record: ThreadSilenceWatchRecord, episode: string) =>
  `t3team-silence:${record.watcherThreadId}:${record.targetThreadId}:stopped:${episode}`;

function formatDuration(ms: number): string {
  if (ms < 1_000) return `${Math.max(1, Math.round(ms))}ms`;
  if (ms < 60_000) return `${Math.round(ms / 1_000)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1_000);
  return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
}

export function buildSilentNoticeText(
  record: ThreadSilenceWatchRecord,
  input: { readonly silentForMs: number; readonly pendingToolCount: number },
): string {
  const toolNote =
    input.pendingToolCount > 0
      ? `A tool call was still in progress (${input.pendingToolCount} open) - a long operation may be legitimate.`
      : `No tool call was in progress - the thread may be wedged.`;
  return (
    `[Thread silent] «${record.targetTitle}» (thread ${record.targetThreadId}) has had no ` +
    `activity for ${formatDuration(input.silentForMs)} (watch timeout ` +
    `${formatDuration(record.timeoutMs)}, watch ${record.watchId}). ${toolNote} ` +
    `Decide whether to nudge, stop, or re-dispatch it; you will be re-notified at each multiple ` +
    `of the timeout while it stays silent.`
  );
}

export function buildStoppedNoticeText(record: ThreadSilenceWatchRecord, status: string): string {
  return (
    `[Thread stopped] «${record.targetTitle}» (thread ${record.targetThreadId}) reached a ` +
    `terminal state (${status}) while you were watching it for silence ` +
    `(watch ${record.watchId}). The watch is closed.`
  );
}
