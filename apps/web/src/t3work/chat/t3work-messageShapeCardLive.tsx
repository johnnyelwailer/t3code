/* oxlint-disable react/no-array-index-key -- Mirrors the static shape card's list rendering. */
/**
 * Live plan-card overlay (recipe UX "no black box" slice). Renders the same plan chrome as
 * {@link ./t3work-messageShapeCard.tsx} but overlays each step with its live runtime status
 * derived from `t3work.recipe.workflow.step` activities (spinner=started, check=completed,
 * clock=waiting, error=failed).
 *
 * RECONCILIATION: the shape is a static AST-derived plan; runtime steps arrive by journal seq
 * and may not match 1:1 (loops, parallel branches). The plan is treated as a skeleton —
 * executed steps map onto plan steps by order (i-th executed step ↔ i-th plan step in display
 * order); unknown runtime steps remain in their journal position with a human fallback label;
 * plan steps not yet executed stay neutral. The run-level terminal activity drives the
 * completed/failed banner.
 *
 * A `waiting` row shows ONLY the waiting state — the ask itself is rendered by the sibling
 * decision card ({@link ./t3work-messageDecisionCard.tsx}); no duplication here.
 */
import {
  CheckCircle2Icon,
  CircleAlertIcon,
  CircleDashedIcon,
  ClockIcon,
  LoaderCircleIcon,
  RouteIcon,
} from "lucide-react";
import type {
  ProjectRecipeWorkflowShapePayload,
  ProjectRecipeWorkflowStepPhase,
} from "@t3tools/project-recipes";

import { cn } from "~/lib/utils";
import { T3workShapeStepRow } from "~/t3work/chat/t3work-messageShapeCard";
import type {
  T3workWorkflowRunProgress,
  T3workWorkflowStepEntry,
} from "~/t3work/chat/t3work-threadWorkflowStepProgress";
import { T3workWorkflowStepDetails } from "~/t3work/chat/t3work-WorkflowStepDetails";
import { reconcileT3workWorkflowShapeProgress } from "./t3work-workflowShapeProgress";

type StepStatus = ProjectRecipeWorkflowStepPhase | "pending";

const STATUS_META: Record<StepStatus, { Icon: typeof ClockIcon; className: string }> = {
  started: { Icon: LoaderCircleIcon, className: "animate-spin text-primary" },
  completed: { Icon: CheckCircle2Icon, className: "text-emerald-600 dark:text-emerald-400" },
  waiting: { Icon: ClockIcon, className: "text-amber-600 dark:text-amber-400" },
  failed: { Icon: CircleAlertIcon, className: "text-destructive" },
  pending: { Icon: CircleDashedIcon, className: "text-muted-foreground/40" },
};

function StepStatusIcon({ status }: { status: StepStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      data-step-status={status}
      className="flex size-5 shrink-0 items-center justify-center"
      title={status === "pending" ? "not started yet" : status}
    >
      <meta.Icon className={cn("size-3.5", meta.className)} />
    </span>
  );
}

function fallbackRuntimeLabel(step: T3workWorkflowStepEntry): string {
  switch (step.stepKind) {
    case "workflow.self-heal":
      // The server supplies only these host-authored labels. Do not expose the repair
      // prompt, provider/model identity, or internal runtime kind in the card.
      return step.phase === "failed"
        ? "Repair attempt failed"
        : step.phase === "completed"
          ? "Workflow recovered"
          : step.detail === "Repairing workflow"
            ? "Repairing workflow"
            : step.detail === "Resuming workflow"
              ? "Resuming workflow"
              : "Analysing failure";
    case "thread.turn":
      return "Agent task";
    case "user.input":
      return "Awaiting your input";
    case "read":
      return "Review information";
    case "act":
      return "Apply changes";
    default:
      return "Additional workflow work";
  }
}

/** An executed step the authored plan has no row for (loop iteration, parallel branch, ...). */
function RuntimeStepRow({ step }: { step: T3workWorkflowStepEntry }) {
  return (
    <div className="flex items-center gap-2.5" data-step-runtime="unknown">
      <StepStatusIcon status={step.phase} />
      <span className="min-w-0 flex-1 truncate text-sm text-foreground/90">
        {fallbackRuntimeLabel(step)}
      </span>
    </div>
  );
}

function RunStatusBanner({ run }: { run: NonNullable<T3workWorkflowRunProgress["run"]> }) {
  const failed = run.phase === "failed";
  return (
    <div
      data-run-status={run.phase}
      className={cn(
        "mt-3 flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm",
        failed
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
      )}
    >
      {failed ? (
        <CircleAlertIcon className="size-4 shrink-0" />
      ) : (
        <CheckCircle2Icon className="size-4 shrink-0" />
      )}
      <span className="min-w-0 flex-1">
        {failed ? "Run failed" : "Run completed"}
        {run.error ? <span className="ml-1 opacity-80">— {run.error}</span> : null}
      </span>
    </div>
  );
}

export function T3workWorkflowShapeLiveCard({
  shape,
  progress,
  onOpenThread,
}: {
  shape: ProjectRecipeWorkflowShapePayload;
  progress: T3workWorkflowRunProgress;
  onOpenThread?: (input: { projectId: string; threadId: string }) => void;
}) {
  const { rows } = reconcileT3workWorkflowShapeProgress(shape.steps, progress.steps);
  const waiting = progress.steps.some((step) => step.phase === "waiting");

  return (
    <div className="rounded-lg border border-primary/35 bg-background/65 px-4 py-3">
      <div className="mb-2 flex items-center gap-1.5 text-primary">
        <RouteIcon className="size-3.5" />
        {shape.name ? (
          <span className="text-sm font-semibold text-foreground">{shape.name}</span>
        ) : null}
        {progress.run === null ? (
          <span className="ml-auto flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
            {waiting ? (
              <ClockIcon className="size-3" />
            ) : (
              <LoaderCircleIcon className="size-3 animate-spin" />
            )}
            {waiting ? "waiting" : "running"}
          </span>
        ) : null}
      </div>
      {shape.description ? (
        <p className="text-sm leading-6 text-muted-foreground">{shape.description}</p>
      ) : null}

      {rows.length > 0 ? (
        <div className="mt-3 space-y-1.5">
          {(() => {
            let priorPlanPhase: string | null = null;
            return rows.map((row, index) => {
              const step = row.runtimeStep;
              const planStep = row.planStep;
              const phaseTitle = planStep?.phase ?? null;
              const showPhaseHeader = phaseTitle !== null && phaseTitle !== priorPlanPhase;
              if (planStep) priorPlanPhase = phaseTitle;
              return (
                <div
                  key={step?.stepId ?? `plan:${index}:${planStep?.label ?? "step"}`}
                  className="space-y-1.5"
                >
                  {showPhaseHeader ? (
                    <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/65">
                      {phaseTitle}
                    </p>
                  ) : null}
                  <T3workWorkflowStepDetails
                    step={step}
                    hideDetail={step?.detail === planStep?.label}
                    redactDetail={step?.stepKind === "workflow.self-heal"}
                    {...(onOpenThread ? { onOpenThread } : {})}
                  >
                    {planStep ? (
                      <T3workShapeStepRow
                        step={planStep}
                        leading={<StepStatusIcon status={step?.phase ?? "pending"} />}
                      />
                    ) : step ? (
                      <RuntimeStepRow step={step} />
                    ) : null}
                  </T3workWorkflowStepDetails>
                </div>
              );
            });
          })()}
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground/70">No steps to preview.</p>
      )}

      {progress.run ? <RunStatusBanner run={progress.run} /> : null}
    </div>
  );
}
