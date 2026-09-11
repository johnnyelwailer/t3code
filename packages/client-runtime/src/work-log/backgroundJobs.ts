/**
 * Background bash jobs: transcript-side fold for "command was backgrounded"
 * tool results.
 *
 * Some agent runtimes (distribution Pi runtime) background a long-running
 * bash command instead of blocking the turn: the tool result then carries a
 * stable handle marker ("it is now a background job: job_xxx") and the job
 * later settles on its own. The turn itself looks finished, so without this
 * fold the thread reads as idle while real work is still in flight.
 *
 * The fold is transcript-driven on purpose: no provider event marks job
 * start/settle, so the ONLY data the client reliably has are the tool
 * results that name the job — the bash yield result (start), and the
 * `process` tool results (list / peek / kill) that name the job's state.
 *
 * State machine per job id:
 *   start marker seen                    -> running
 *   terminal marker for the id seen      -> finished (sticky)
 *   now > startedAt + hard deadline      -> excluded (a job cannot outlive
 *                                           its hard deadline; the marker
 *                                           text carries the deadline, so
 *                                           stale transcripts self-clear)
 *
 * Pure and dependency-free: the client computes this from ordinary work-log
 * entries (createdAt + tool result detail) without any new wire data, and
 * carries its own tiny duration formatter (same shapes as the shared
 * formatDuration: "45s", "2m 10s", "1h 5s") so the module stays self-contained.
 *
 * @module work-log/backgroundJobs
 */

export interface BackgroundJobStart {
  readonly jobId: string;
  /** Best-effort job start (marker observed time minus the reported elapsed). */
  readonly startedAtMs: number;
  /** Hard kill deadline reported in the marker (start + deadline). */
  readonly deadlineMs: number;
}

export type BackgroundJobFinishReason = "finished" | "killed-deadline" | "cancelled";

export interface BackgroundJobState extends BackgroundJobStart {
  readonly state: "running" | "finished";
  readonly finishedReason?: BackgroundJobFinishReason;
  /** Entry id of the work-log row that first reported the job's start. */
  readonly startedEntryId?: string;
  /** Entry id of the work-log row that last mentioned this job. */
  readonly lastSeenEntryId?: string;
}

export interface BackgroundJobFoldEntry {
  /** Id of the work-log entry (timeline row anchor). */
  readonly id: string;
  /** ISO timestamp the entry was observed. */
  readonly createdAt: string;
  /** Tool result / item detail text, if any. */
  readonly detail?: string | undefined;
}

/**
 * A job's hard deadline is a kill wall, not a settle guarantee — output flush
 * and exit handling can land a few seconds after it. A short grace keeps a
 * just-settled job visible instead of making the indicator blink off at the
 * boundary.
 */
export const BACKGROUND_JOB_DEADLINE_GRACE_MS = 60_000;

const JOB_ID = String.raw`job_[0-9a-zA-Z]+`;

/** The bash yield marker: "…it is now a background job: job_xxx (pid N)." */
const START_RE = new RegExp(String.raw`background job:\s*(${JOB_ID})`);
/** "Command still running after 10s — …" (elapsed at yield time). */
const ELAPSED_RE = new RegExp(String.raw`still running after (\d+)s`);
/** "…under a 600s hard deadline owned by this thread…". */
const DEADLINE_RE = new RegExp(String.raw`(\d+)s hard deadline`);

/** peek tail: "[job job_xxx finished]" — any settled state. */
const PEEK_SETTLED_RE = new RegExp(String.raw`\[job (${JOB_ID}) finished\]`, "g");
/**
 * list row: "job_xxx  completed (exit 0, 30s)" / "job_xxx  failed (exit 1, …)".
 * The state word is the registry's settled vocabulary (completed | failed).
 */
const LIST_SETTLED_RE = new RegExp(String.raw`(^|\n)(${JOB_ID})\s+(?:completed|failed)\b`, "g");
/** list row: "job_xxx  killed at its deadline (601s)" */
const LIST_KILLED_RE = new RegExp(String.raw`(^|\n)(${JOB_ID})\s+killed at its deadline\b`, "g");
/** list row: "job_xxx  cancelled" */
const LIST_CANCELLED_RE = new RegExp(String.raw`(^|\n)(${JOB_ID})\s+cancelled\b`, "g");
/** kill: "Kill requested for job_xxx; it will be reported as cancelled." */
const KILL_REQUESTED_RE = new RegExp(String.raw`Kill requested for (${JOB_ID})`, "g");
/**
 * The completion notice body, in either observed shape:
 * "Background job job_xxx (cmd) is completed (…)" or the live-delivery form
 * "background job job_xxx finished. Use the process tool…". The start marker
 * says "background job: job_xxx" (colon), so it cannot match here.
 */
const NOTICE_SETTLED_RE = new RegExp(
  String.raw`background job\s+(${JOB_ID})(?:\s+\(.*?\))?\s+(?:is\s+)?(?:completed|failed|killed|cancelled|finished)\b`,
  "gi",
);

function toFiniteMs(iso: string): number {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

/** "45s" / "2m 10s" / "1h 5s" — mirrors @t3tools/shared's formatDuration shapes. */
function formatJobDuration(durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs < 0) return "0s";
  if (durationMs < 60_000) return `${Math.round(durationMs / 1_000)}s`;
  const totalSeconds = Math.round(durationMs / 1_000);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0) parts.push(`${seconds}s`);
  return parts.length > 0 ? parts.join(" ") : "0s";
}

/**
 * Detects the background-job handle in a tool result and derives the job's
 * start + hard-deadline times. Returns null for ordinary (inline) results.
 */
export function detectBackgroundJobStart(
  detail: string,
  observedAtMs: number,
): BackgroundJobStart | null {
  const match = START_RE.exec(detail);
  if (match === null) return null;
  const jobId = match[1];
  if (jobId === undefined) return null;
  const elapsedMatch = ELAPSED_RE.exec(detail);
  const elapsedSecs = elapsedMatch !== null ? Number(elapsedMatch[1]) : 0;
  const deadlineMatch = DEADLINE_RE.exec(detail);
  const deadlineSecs = deadlineMatch !== null ? Number(deadlineMatch[1]) : 0;
  const startedAtMs = Math.max(0, observedAtMs - elapsedSecs * 1000);
  return {
    jobId,
    startedAtMs,
    deadlineMs: startedAtMs + deadlineSecs * 1000,
  };
}

/**
 * Terminal-state mentions of jobs inside one tool result (list / peek / kill
 * output). Jobs absent from the map are untouched — "list" output omits
 * settled-ago entries, so an absent job is NOT a finish signal.
 */
export function backgroundJobFinishSignals(detail: string): Map<string, BackgroundJobFinishReason> {
  const signals = new Map<string, BackgroundJobFinishReason>();
  let m: RegExpExecArray | null;
  const record = (re: RegExp, jobIdGroup: 1 | 2, reason: BackgroundJobFinishReason) => {
    re.lastIndex = 0;
    while ((m = re.exec(detail)) !== null) {
      const jobId = m[jobIdGroup];
      if (jobId !== undefined) signals.set(jobId, reason);
    }
  };
  record(PEEK_SETTLED_RE, 1, "finished");
  record(LIST_SETTLED_RE, 2, "finished");
  record(LIST_KILLED_RE, 2, "killed-deadline");
  record(LIST_CANCELLED_RE, 2, "cancelled");
  record(KILL_REQUESTED_RE, 1, "cancelled");
  record(NOTICE_SETTLED_RE, 1, "finished");
  return signals;
}

/**
 * Folds a thread's work-log entries (in timeline order) into per-job state.
 * A start marker opens the job; later terminal markers settle it. Sticky:
 * once finished, the job stays finished for the lifetime of this fold.
 */
export function foldBackgroundJobs(
  entries: ReadonlyArray<BackgroundJobFoldEntry>,
  nowMs: number,
): readonly BackgroundJobState[] {
  const byId = new Map<string, BackgroundJobState>();
  for (const entry of entries) {
    const detail = entry.detail;
    if (detail === undefined || detail.length === 0) continue;
    const observedAtMs = toFiniteMs(entry.createdAt);
    const start = detectBackgroundJobStart(detail, observedAtMs);
    if (start !== null) {
      const existing = byId.get(start.jobId);
      const settled = existing?.state === "finished";
      byId.set(start.jobId, {
        ...start,
        state: settled ? "finished" : "running",
        startedEntryId: existing?.startedEntryId ?? entry.id,
        lastSeenEntryId: entry.id,
        ...(settled && existing !== undefined ? { finishedReason: existing.finishedReason } : {}),
      });
    }
    const signals = backgroundJobFinishSignals(detail);
    if (signals.size > 0) {
      for (const [jobId, reason] of signals) {
        const existing =
          byId.get(jobId) ??
          ({
            jobId,
            startedAtMs: observedAtMs,
            deadlineMs: observedAtMs,
            state: "running" as const,
          } satisfies BackgroundJobState);
        if (existing.state !== "finished") {
          byId.set(jobId, {
            ...existing,
            state: "finished",
            finishedReason: reason,
            startedEntryId: existing.startedEntryId ?? entry.id,
            lastSeenEntryId: entry.id,
          });
        }
      }
    }
  }
  return [...byId.values()];
}

/**
 * Jobs that are still plausibly running: finished jobs drop out, and a job
 * past its hard deadline + grace cannot be running anymore (the marker's
 * deadline is a kill wall) — that is what keeps old, settled threads quiet.
 */
export function runningBackgroundJobs(
  jobs: ReadonlyArray<BackgroundJobState>,
  nowMs: number,
): readonly BackgroundJobState[] {
  const cutoff = nowMs - BACKGROUND_JOB_DEADLINE_GRACE_MS;
  return jobs.filter((job) => job.state === "running" && job.deadlineMs >= cutoff);
}

/**
 * The human line, mirroring the process tool's own wording:
 * "1 background job running · 45s" / "2 background jobs running · 2m 10s".
 * Age = the oldest running job's elapsed, in the shared duration format.
 * Null when nothing is running.
 */
export function backgroundJobsSummaryLabel(
  running: ReadonlyArray<BackgroundJobState>,
  nowMs: number,
): string | null {
  if (running.length === 0) return null;
  let oldest = running[0]!;
  for (const job of running) {
    if (job.startedAtMs < oldest.startedAtMs) oldest = job;
  }
  const age = formatJobDuration(nowMs - oldest.startedAtMs);
  return `${running.length} background job${running.length === 1 ? "" : "s"} running · ${age}`;
}
