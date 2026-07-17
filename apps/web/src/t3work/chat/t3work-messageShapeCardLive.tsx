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
 * order); executed steps beyond the plan are APPENDED as extra rows; plan steps not yet
 * executed stay neutral. The run-level terminal activity drives the completed/failed banner.
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
import { groupT3workShapeSteps, T3workShapeStepRow } from "~/t3work/chat/t3work-messageShapeCard";
import type {
  T3workWorkflowRunProgress,
  T3workWorkflowStepEntry,
} from "~/t3work/chat/t3work-threadWorkflowStepProgress";

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

/** An executed step the plan has no row for (loop iteration, parallel branch, ...). */
function ExtraStepRow({ step }: { step: T3workWorkflowStepEntry }) {
  return (
    <div className="flex items-center gap-2.5" data-step-extra="true">
      <StepStatusIcon status={step.phase} />
      <span className="min-w-0 flex-1 truncate text-sm text-foreground/90">
        {step.detail ?? step.stepKind}
      </span>
      <span className="shrink-0 rounded-full border border-border/55 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {step.stepKind}
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
}: {
  shape: ProjectRecipeWorkflowShapePayload;
  progress: T3workWorkflowRunProgress;
}) {
  const groups = groupT3workShapeSteps(shape);
  const planCount = groups.reduce((count, group) => count + group.steps.length, 0);
  const extras = progress.steps.slice(planCount);
  // Flat display index across groups — the i-th plan row takes the i-th executed step's phase.
  let flatIndex = 0;

  return (
    <div className="rounded-lg border border-primary/35 bg-background/65 px-4 py-3">
      <div className="mb-2 flex items-center gap-1.5 text-primary">
        <RouteIcon className="size-3.5" />
        <span className="text-[11px] font-semibold uppercase tracking-wide">The plan</span>
        {progress.run === null ? (
          <span className="ml-auto flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
            <LoaderCircleIcon className="size-3 animate-spin" />
            running
          </span>
        ) : null}
      </div>
      {shape.name ? <p className="text-sm font-semibold text-foreground">{shape.name}</p> : null}
      {shape.description ? (
        <p className="mt-0.5 text-sm leading-6 text-muted-foreground">{shape.description}</p>
      ) : null}

      {shape.phases.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {shape.phases.map((phase, index) => (
            <span
              key={`phase:${index}:${phase.title}`}
              className="rounded-full border border-border/60 bg-muted/30 px-2 py-0.5 text-[11px] text-muted-foreground"
            >
              {index + 1}. {phase.title}
            </span>
          ))}
        </div>
      ) : null}

      {planCount > 0 || extras.length > 0 ? (
        <div className="mt-3 space-y-3">
          {groups.map((group, index) => (
            <div key={`group:${index}:${group.title ?? "_"}`} className="space-y-1.5">
              {group.title ? (
                <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/65">
                  {group.title}
                </p>
              ) : null}
              {group.steps.map((step, stepIndex) => {
                const executed = progress.steps[flatIndex];
                flatIndex += 1;
                return (
                  <T3workShapeStepRow
                    key={`step:${index}:${stepIndex}`}
                    step={step}
                    leading={<StepStatusIcon status={executed?.phase ?? "pending"} />}
                  />
                );
              })}
            </div>
          ))}
          {extras.length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/65">
                Additional steps
              </p>
              {extras.map((step) => (
                <ExtraStepRow key={step.stepId} step={step} />
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground/70">No steps to preview.</p>
      )}

      {progress.run ? <RunStatusBanner run={progress.run} /> : null}
    </div>
  );
}
