/**
 * What a step's live status LOOKS like, and how a plan row's status is decided.
 *
 * Its own module because the "skipped" rule lives here and is the interesting decision: a plan row the run
 * never reached is only "not started yet" while the run is still going. Once it has settled, that row will
 * never start — rendering it as a pending circle made a finished run look hung, which is exactly what
 * `describe-rewrite` produced when its body skipped the ask because intent was already supplied.
 */

import {
  CheckCircle2Icon,
  CircleAlertIcon,
  CircleDashedIcon,
  CircleSlashIcon,
  ClockIcon,
  LoaderCircleIcon,
  PauseIcon,
  SquareIcon,
} from "lucide-react";
import type { OrchestrationWorkflowRunStatus } from "@t3tools/contracts";
import type { ProjectRecipeWorkflowStepPhase } from "@t3tools/project-recipes";

import { cn } from "~/lib/utils";
import type { T3TeamWorkflowStepEntry } from "~/t3team/chat/t3team-threadWorkflowStepProgress";

export type StepStatus = ProjectRecipeWorkflowStepPhase | "pending" | "scheduled" | "skipped";

const STATUS_META: Record<StepStatus, { Icon: typeof ClockIcon; className: string }> = {
  started: { Icon: LoaderCircleIcon, className: "animate-spin text-primary" },
  completed: { Icon: CheckCircle2Icon, className: "text-emerald-600 dark:text-emerald-400" },
  waiting: { Icon: CircleDashedIcon, className: "text-muted-foreground" },
  scheduled: { Icon: ClockIcon, className: "text-amber-600 dark:text-amber-400" },
  failed: { Icon: CircleAlertIcon, className: "text-destructive" },
  paused: { Icon: PauseIcon, className: "text-muted-foreground" },
  cancelled: { Icon: SquareIcon, className: "text-muted-foreground" },
  pending: { Icon: CircleDashedIcon, className: "text-muted-foreground/40" },
  skipped: { Icon: CircleSlashIcon, className: "text-muted-foreground/50" },
};

export function StepStatusIcon({ status }: { status: StepStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      data-step-status={status}
      className="flex size-5 shrink-0 items-center justify-center"
      title={
        status === "pending"
          ? "not started yet"
          : status === "skipped"
            ? "skipped — the run did not need this step"
            : status
      }
    >
      <meta.Icon className={cn("size-3.5", meta.className)} />
    </span>
  );
}

export function displayedStepStatus(
  step: T3TeamWorkflowStepEntry | undefined,
  runStatus?: OrchestrationWorkflowRunStatus["status"],
): StepStatus {
  // A plan row the run never reached. Once the run has SETTLED it is not "not started yet" — it will never
  // start, and an eternally-pending circle reads as a hung step. `describe-rewrite`'s ask is the live case:
  // the body skips it when intent was supplied, so the plan row never gets a runtime match.
  if (step === undefined) {
    return runStatus === "completed" || runStatus === "failed" || runStatus === "cancelled"
      ? "skipped"
      : "pending";
  }
  if (step.phase === "started" || step.phase === "waiting") {
    if (runStatus === "cancelled") return "cancelled";
    if (runStatus === "failed") return "failed";
    if (runStatus === "paused") return "paused";
    if (runStatus === "completed") return "completed";
  }
  if (step.stepKind === "wait.until" && (step.phase === "started" || step.phase === "waiting")) {
    return "scheduled";
  }
  return step.phase;
}
