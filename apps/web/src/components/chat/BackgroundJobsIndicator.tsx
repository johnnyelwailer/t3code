import { useEffect, useMemo, useState } from "react";

import {
  backgroundJobsSummaryLabel,
  runningBackgroundJobs,
  type BackgroundJobState,
} from "@t3tools/client-runtime/work-log/background-jobs";
import { formatDuration } from "@t3tools/shared/orchestrationTiming";

import { observeVisibleAnimation } from "../../lib/visibleAnimation";
import { cn } from "../../lib/utils";

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
}: {
  readonly jobs: readonly BackgroundJobState[];
  readonly className?: string;
}) {
  const active = runningBackgroundJobs(jobs, Date.now()).length > 0;
  const now = useNow(active);
  const running = useMemo(() => runningBackgroundJobs(jobs, now), [jobs, now]);
  const [expanded, setExpanded] = useState(false);
  const label = useMemo(() => backgroundJobsSummaryLabel(running, now), [running, now]);
  if (label === null) return null;
  // The live region announces changes to the stable part (count) only; the
  // per-second age is aria-hidden so screen readers do not announce every
  // tick ("…45s", "…46s", …).
  const splitAt = label.lastIndexOf(" · ");
  const stable = splitAt > 0 ? label.slice(0, splitAt) : label;
  const agePart = splitAt > 0 ? label.slice(splitAt) : null;
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 py-1 text-sm leading-relaxed text-muted-foreground tabular-nums",
        className ?? "px-0.5",
      )}
      role="status"
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-label={expanded ? "Hide background job details" : "Show background job details"}
        onClick={() => setExpanded((open) => !open)}
        className="-mx-1 flex min-w-0 items-center gap-1.5 rounded px-1 py-0.5 text-left outline-none hover:bg-foreground/5 focus-visible:bg-foreground/5"
      >
        <span
          aria-hidden
          ref={observeVisibleAnimation}
          className="size-1.5 shrink-0 rounded-full bg-info motion-safe:visible-animate-pulse"
        />
        <span className="min-w-0 truncate">{stable}</span>
        {agePart !== null ? (
          <span aria-hidden className="truncate">
            {agePart}
          </span>
        ) : null}
      </button>
      {expanded && running.length > 0 ? (
        <BackgroundJobList running={running} now={now} />
      ) : null}
    </div>
  );
}

/**
 * The expanded per-job rows: what is running, under which pid, and how much
 * of its hard deadline is left. Command and pid are best-effort — rows
 * persisted before the pack named its commands carry only the job id, and a
 * "pid ?" marker carries no pid. Each degrades to the job id / no line.
 */
export function BackgroundJobList({
  running,
  now,
}: {
  readonly running: readonly BackgroundJobState[];
  readonly now: number;
}) {
  return (
    <ul className="mt-1 space-y-1.5 border-l border-border/60 pl-3 pr-1" aria-label="Running background jobs">
      {running.map((job) => {
        const total = Math.max(0, job.deadlineMs - job.startedAtMs);
        return (
          <li key={job.jobId} className="min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <span
                className="min-w-0 truncate font-mono text-xs text-foreground/80"
                title={job.command ?? job.jobId}
              >
                {job.command ?? job.jobId}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground/70">
                {formatDuration(now - job.startedAtMs)} / {formatDuration(total)}
              </span>
            </div>
            {job.pid !== undefined ? (
              <div className="text-[.65rem] tabular-nums text-muted-foreground/60">pid {job.pid}</div>
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
