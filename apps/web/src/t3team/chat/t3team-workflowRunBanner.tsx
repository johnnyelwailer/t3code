/**
 * Run-level chrome for a live workflow card: the terminal banner, and the self-heal strip.
 *
 * Separate from the per-step row because these speak about the RUN — "completed", "failed", "getting the
 * orchestration ready" — while a step row speaks about one step. Keeping them apart is also what keeps both
 * files inside the 200-line cap.
 */

import {
  CheckCircle2Icon,
  ChevronRightIcon,
  CircleAlertIcon,
  CircleDashedIcon,
  LoaderCircleIcon,
  PauseIcon,
  SquareIcon,
} from "lucide-react";

import { cn } from "~/lib/utils";
import type { T3TeamWorkflowRunProgress } from "~/t3team/chat/t3team-threadWorkflowStepProgress";
import { repairStatus } from "~/t3team/chat/t3team-workflowRunLabels";
import { canOpenStepThread } from "~/t3team/chat/t3team-workflowRunStepRow";

export function RunStatusBanner({
  run,
  outcomeSummary,
}: {
  run: NonNullable<T3TeamWorkflowRunProgress["run"]>;
  /** A short, honest outcome line for this run (see `findT3TeamWorkflowRunOutcomeSummaries`) —
   * NEVER the full result. The full result renders in its own message body as markdown; this
   * banner stays a status line, at most a few plain words longer. */
  outcomeSummary?: string | undefined;
}) {
  if (run.phase === "started") return null;
  const failed = run.phase === "failed";
  const paused = run.phase === "paused";
  const cancelled = run.phase === "cancelled";
  return (
    <div
      data-run-status={run.phase}
      className={cn(
        "mt-3 flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm",
        failed
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : paused || cancelled
            ? "border-border bg-muted/30 text-muted-foreground"
            : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
      )}
    >
      {failed ? (
        <CircleAlertIcon className="size-4 shrink-0" />
      ) : paused ? (
        <PauseIcon className="size-4 shrink-0" />
      ) : cancelled ? (
        <SquareIcon className="size-4 shrink-0" />
      ) : (
        <CheckCircle2Icon className="size-4 shrink-0" />
      )}
      <span className="min-w-0 flex-1 truncate">
        {failed
          ? "Run failed"
          : paused
            ? "Run paused"
            : cancelled
              ? "Run stopped"
              : "Run completed"}
        {run.error ? <span className="ml-1 opacity-80">— {run.error}</span> : null}
        {outcomeSummary ? (
          <span data-run-outcome-summary="" className="ml-1 opacity-80">
            · {outcomeSummary}
          </span>
        ) : null}
      </span>
    </div>
  );
}

export function RepairStatusStrip({
  repair,
  onOpenThread,
  currentThreadId,
}: {
  repair: NonNullable<ReturnType<typeof repairStatus>>;
  onOpenThread?: (input: { projectId: string; threadId: string }) => void;
  currentThreadId?: string | undefined;
}) {
  const { label: status, reason, step } = repair;
  const needsAttention = status === "Needs attention";
  const ready = status === "Orchestration ready";
  const activelyPreparing = status === "Getting orchestration ready";
  const canOpenThread = canOpenStepThread({
    step,
    currentThreadId,
    hasHandler: onOpenThread !== undefined,
  });
  const className = cn(
    "mt-3 flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-xs font-medium",
    needsAttention
      ? "border-destructive/40 bg-destructive/10 text-destructive"
      : ready
        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
        : "border-primary/25 bg-primary/5 text-foreground/80",
  );
  const content = (
    <>
      {needsAttention ? (
        <CircleAlertIcon className="size-3.5 shrink-0" />
      ) : ready ? (
        <CheckCircle2Icon className="size-3.5 shrink-0" />
      ) : activelyPreparing ? (
        <LoaderCircleIcon className="size-3.5 shrink-0 animate-spin text-primary" />
      ) : (
        <CircleDashedIcon className="size-3.5 shrink-0 text-muted-foreground" />
      )}
      <span className="min-w-0 flex-1">
        <span className="block">{status}</span>
        {reason ? <span className="mt-0.5 block font-normal opacity-80">{reason}</span> : null}
      </span>
      {canOpenThread ? <ChevronRightIcon className="size-4 shrink-0" aria-hidden="true" /> : null}
    </>
  );
  return (
    <button
      type="button"
      data-workflow-repair-status={status}
      className={className}
      disabled={!canOpenThread}
      aria-label={canOpenThread ? "Open orchestration repair thread" : undefined}
      onClick={() => onOpenThread?.({ projectId: step.projectId!, threadId: step.threadId! })}
    >
      {content}
    </button>
  );
}
