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
 * as idle).
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
  const label = useMemo(
    () => backgroundJobsSummaryLabel(runningBackgroundJobs(jobs, now), now),
    [jobs, now],
  );
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
    </div>
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
