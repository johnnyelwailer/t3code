import { useEffect, useMemo, useState } from "react";

import {
  backgroundJobsSummaryLabel,
  runningBackgroundJobs,
  type BackgroundJobState,
} from "@t3tools/client-runtime/work-log/background-jobs";
import { formatDuration } from "@t3tools/shared/orchestrationTiming";

import type { ThreadJobsController } from "~/t3team/backend/t3team-thread-jobsBackend";

import { observeVisibleAnimation } from "../../lib/visibleAnimation";
import { cn } from "../../lib/utils";
import { BackgroundJobOutputPanel } from "./BackgroundJobOutputPanel";

/** Shared empty set default for optional cancel-state props. */
const EMPTY_SET: ReadonlySet<string> = new Set();

/**
 * "N background job(s) running · <age>" — the thread-level indicator for
 * bash jobs that outlive their tool call (the agent runtime backgrounds
 * long-running commands; the job settles later, so the thread must not read
 * as idle). The line is a toggle: expanding it lists each running job —
 * command, pid, elapsed over hard deadline — without leaving the slot.
 *
 * Both components own their 1s tick (same pattern as WorkingLeadText): the
 * age display re-renders this small leaf only, never the timeline.
 */

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

/**
 * Thread-level line, rendered in the WORKING-ROW SLOT at the end of the
 * timeline — the one place a reader looks to answer "is anything happening".
 *
 * It used to live in the list footer, below the end of the conversation and
 * outside that slot, which is where it was invisible in practice: a turn that
 * backgrounds a command settles immediately, the working row disappears, and
 * the only sign of ten minutes of live work was a muted line under the last
 * message. Same component, same fold — the slot is the fix.
 *
 * It disappears on its own when the last job settles or passes its hard
 * deadline, and the tick stops as soon as nothing can still be running, so
 * idle threads pay nothing.
 */
export function BackgroundJobsRunningIndicator({
  jobs,
  className,
  threadId,
  controller,
}: {
  readonly jobs: readonly BackgroundJobState[];
  readonly className?: string;
  /**
   * With BOTH `threadId` and `controller` present, each running job row
   * gains Cancel and Output — the out-of-band control channel. Without
   * them the indicator stays read-only (surfaces that cannot reach the
   * runtime's job registry: mobile, embedded previews, mocked stories).
   */
  readonly threadId?: string;
  readonly controller?: ThreadJobsController;
}) {
  const active = runningBackgroundJobs(jobs, Date.now()).length > 0;
  const now = useNow(active);
  const running = useMemo(() => runningBackgroundJobs(jobs, now), [jobs, now]);
  const [expanded, setExpanded] = useState(false);
  // Jobs killed FROM THE UI: the transcript fold settles them only when the
  // runtime's notice reaches the transcript, so until then the row is kept
  // visible but dimmed as "cancelled" instead of vanishing or lying.
  const [cancelled, setCancelled] = useState<ReadonlySet<string>>(new Set());
  const [cancelPending, setCancelPending] = useState<ReadonlySet<string>>(new Set());
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [outputJob, setOutputJob] = useState<string | null>(null);

  const canControl = threadId !== undefined && controller !== undefined;
  const liveRunning = useMemo(
    () => running.filter((job) => !cancelled.has(job.jobId)),
    [running, cancelled],
  );
  // Prune local cancel state as jobs leave the fold (settled, deadline-passed):
  // a stale "cancelled" marker must not survive the job's own disappearance.
  useEffect(() => {
    setCancelled((previous) => {
      const ids = new Set(running.map((job) => job.jobId));
      const next = new Set([...previous].filter((id) => ids.has(id)));
      return next.size === previous.size ? previous : next;
    });
  }, [running]);
  const label = useMemo(() => backgroundJobsSummaryLabel(liveRunning, now), [liveRunning, now]);
  if (label === null && running.length === 0) return null;

  const handleCancel = async (job: BackgroundJobState) => {
    if (threadId === undefined || controller === undefined) return;
    setCancelError(null);
    setCancelPending((current) => new Set(current).add(job.jobId));
    try {
      const response = await controller({
        threadId,
        request: { kind: "cancel", jobId: job.jobId },
      });
      if (response.supported === false) {
        setCancelError("Job control is not available on this runtime.");
        return;
      }
      if (response.result.kind === "unknown-job") {
        setCancelled((current) => new Set(current).add(job.jobId));
        return;
      }
      setCancelled((current) => new Set(current).add(job.jobId));
    } catch (e) {
      setCancelError(e instanceof Error ? e.message : String(e));
    } finally {
      setCancelPending((current) => {
        const next = new Set(current);
        next.delete(job.jobId);
        return next;
      });
    }
  };

  // The live region announces changes to the stable part (count) only; the
  // per-second age is aria-hidden so screen readers do not announce every
  // tick ("…45s", "…46s", …).
  const splitAt = label?.lastIndexOf(" · ") ?? -1;
  const stable = label !== null && splitAt > 0 ? label.slice(0, splitAt) : (label ?? "");
  const agePart = label !== null && splitAt > 0 ? label.slice(splitAt) : null;
  const cancelledJobs = running.filter((job) => cancelled.has(job.jobId));
  return (
    <div
      className={cn(
        "flex flex-col py-1 text-sm leading-relaxed text-muted-foreground tabular-nums",
        className ?? "px-0.5",
      )}
      role="status"
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-label={expanded ? "Hide background job details" : "Show background job details"}
        onClick={() => setExpanded((open) => !open)}
        className="-mx-1 mt-0.5 flex min-w-0 items-center gap-1.5 rounded px-1 py-0.5 text-left outline-none hover:bg-foreground/5 focus-visible:bg-foreground/5"
      >
        <span
          aria-hidden
          ref={observeVisibleAnimation}
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            liveRunning.length > 0 ? "bg-info motion-safe:visible-animate-pulse" : "bg-info/50",
          )}
        />
        <span className="min-w-0 truncate">
          {liveRunning.length > 0 ? stable : `job${cancelledJobs.length > 1 ? "s" : ""} settled`}
        </span>
        {agePart !== null ? (
          <span aria-hidden className="truncate">
            {agePart}
          </span>
        ) : null}
      </button>
      {expanded && running.length > 0 ? (
        <div className="min-w-0">
          <BackgroundJobList
            running={liveRunning}
            cancelled={cancelledJobs}
            now={now}
            canControl={canControl}
            cancelPending={cancelPending}
            onCancel={handleCancel}
            onShowOutput={(job) => setOutputJob(job.jobId)}
          />
          {cancelError !== null ? (
            <div className="mt-1 text-[.7rem] text-destructive">{cancelError}</div>
          ) : null}
          {outputJob !== null && threadId !== undefined && controller !== undefined ? (
            <BackgroundJobOutputPanel
              threadId={threadId}
              jobId={outputJob}
              controller={controller}
              onClose={() => setOutputJob(null)}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The expanded per-job rows: what is running, under which pid, and how much
 * of its hard deadline is left. Command and pid are best-effort — rows
 * persisted before the pack named its commands carry only the job id, and a
 * "pid ?" marker carries no pid. Each degrades to the job id / no line.
 *
 * With `canControl`, each running row also carries Cancel (stops the process
 * in the runtime's registry) and Output (opens the live tail panel).
 */
export function BackgroundJobList({
  running,
  cancelled = [],
  now,
  canControl = false,
  cancelPending = EMPTY_SET,
  onCancel,
  onShowOutput,
}: {
  readonly running: readonly BackgroundJobState[];
  readonly cancelled?: readonly BackgroundJobState[];
  readonly now: number;
  readonly canControl?: boolean;
  readonly cancelPending?: ReadonlySet<string>;
  readonly onCancel?: (job: BackgroundJobState) => void;
  readonly onShowOutput?: (job: BackgroundJobState) => void;
}) {
  return (
    <ul
      className="mt-1 space-y-1.5 border-l border-border/60 pl-3 pr-1"
      aria-label="Running background jobs"
    >
      {[...running, ...cancelled].map((job) => {
        const isCancelled = cancelled.some((c) => c.jobId === job.jobId);
        const total = Math.max(0, job.deadlineMs - job.startedAtMs);
        const pending = cancelPending.has(job.jobId);
        return (
          <li key={job.jobId} className="min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <span
                className={cn(
                  "min-w-0 truncate font-mono text-xs",
                  isCancelled ? "text-muted-foreground/50 line-through" : "text-foreground/80",
                )}
                title={job.command ?? job.jobId}
              >
                {job.command ?? job.jobId}
              </span>
              <span className="flex shrink-0 items-baseline gap-2">
                {isCancelled ? (
                  <span className="text-xs tabular-nums text-muted-foreground/60">cancelled</span>
                ) : (
                  <span className="text-xs tabular-nums text-muted-foreground/70">
                    {formatDuration(now - job.startedAtMs)} / {formatDuration(total)}
                  </span>
                )}
                {canControl && onCancel && onShowOutput ? (
                  <span className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onShowOutput(job)}
                      className="rounded px-1 text-[.65rem] text-muted-foreground outline-none hover:bg-foreground/5 hover:text-foreground focus-visible:bg-foreground/5"
                    >
                      output
                    </button>
                    {!isCancelled ? (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => onCancel(job)}
                        className="rounded px-1 text-[.65rem] text-destructive/80 outline-none hover:bg-destructive/10 hover:text-destructive focus-visible:bg-destructive/10 disabled:opacity-50"
                      >
                        {pending ? "stopping…" : "cancel"}
                      </button>
                    ) : null}
                  </span>
                ) : null}
              </span>
            </div>
            {job.pid !== undefined ? (
              <div className="text-[.65rem] tabular-nums text-muted-foreground/60">
                pid {job.pid}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The tool-card anchor: the bash row whose result yielded a job handle gets a
 * quiet "running in background" age tag so it stops reading as a finished
 * call. Renders nothing once the job settles or passes its hard deadline.
 */
export function BackgroundJobRunningBadge({ job }: { readonly job: BackgroundJobState }) {
  const active = runningBackgroundJobs([job], Date.now()).length > 0;
  const now = useNow(active);
  if (runningBackgroundJobs([job], now).length === 0) return null;
  const age = formatDuration(now - job.startedAtMs);
  return (
    <span
      className="flex shrink-0 items-center gap-1 text-[.7rem] text-muted-foreground tabular-nums"
      role="status"
    >
      <span
        aria-hidden
        ref={observeVisibleAnimation}
        className="size-1 shrink-0 rounded-full bg-info motion-safe:visible-animate-pulse"
      />
      <span>running in background</span>
      <span aria-hidden>· {age}</span>
    </span>
  );
}
