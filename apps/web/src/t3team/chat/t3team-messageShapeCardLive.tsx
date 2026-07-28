/* oxlint-disable react/no-array-index-key -- Mirrors the static shape card's list rendering. */
/**
 * Live plan-card overlay (recipe UX "no black box" slice). Renders the same plan chrome as
 * {@link ./t3team-messageShapeCard.tsx} but overlays each step with its live runtime status
 * derived from `t3team.recipe.workflow.step` activities (spinner=active, check=completed,
 * clock=scheduled timer, dashed circle=pending, error=failed).
 *
 * RECONCILIATION: the shape is a static AST-derived plan; runtime steps arrive by journal seq
 * and may not match 1:1 (loops, parallel branches). The plan is treated as a skeleton —
 * executed steps map onto plan steps by order (i-th executed step ↔ i-th plan step in display
 * order); unknown runtime steps remain in their journal position with a human fallback label;
 * plan steps not yet executed stay neutral. The run-level terminal activity drives the
 * completed/failed banner.
 *
 * A `waiting` row shows ONLY the waiting state — the ask itself is rendered by the sibling
 * decision card ({@link ./t3team-messageDecisionCard.tsx}); no duplication here.
 */
import {
  CircleDashedIcon,
  ClockIcon,
  RouteIcon,
} from "lucide-react";
import type { OrchestrationWorkflowRunStatus } from "@t3tools/contracts";
import { useEffect, useState } from "react";
import type {
  ProjectRecipeWorkflowShapePayload,
} from "@t3tools/project-recipes";

import {
  T3TeamWorkflowRunControls,
  T3TeamWorkflowRunControlStatus,
} from "~/t3team/chat/t3team-workflowRunControls";
import { T3TeamShapeStepRow } from "~/t3team/chat/t3team-messageShapeCard";
import { T3TeamShapeCapabilityChips } from "~/t3team/chat/t3team-messageShapeCardCapabilities";
import type {
  T3TeamWorkflowRunProgress,
} from "~/t3team/chat/t3team-threadWorkflowStepProgress";
import { T3TeamWorkflowStepDetails } from "~/t3team/chat/t3team-WorkflowStepDetails";
import {
  inferredRunStatus,
  liveRunLabel,
  repairStatus,
} from "~/t3team/chat/t3team-workflowRunLabels";
import {
  displayedStepStatus,
  RuntimeStepRow,
  StepStatusIcon,
  StepTrailing,
} from "~/t3team/chat/t3team-workflowRunStepRow";
import { RepairStatusStrip, RunStatusBanner } from "~/t3team/chat/t3team-workflowRunBanner";
export { formatWorkflowStepDue } from "~/t3team/chat/t3team-workflowRunLabels";
import { reconcileT3TeamWorkflowShapeProgress } from "./t3team-workflowShapeProgress";

export function workflowControlErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/\b404\b|not found/i.test(message)) {
    return "Server restart required to use orchestration controls in this development session.";
  }
  return message.trim() || "Orchestration control failed. Please try again.";
}

export function T3TeamWorkflowShapeLiveCard({
  shape,
  progress,
  workflowRunStatus,
  onControlWorkflow,
  onOpenThread,
  currentThreadId,
  childStatuses,
}: {
  shape: ProjectRecipeWorkflowShapePayload;
  progress: T3TeamWorkflowRunProgress;
  workflowRunStatus?: OrchestrationWorkflowRunStatus;
  onControlWorkflow?: (input: {
    workflowRunId: string;
    action: "pause" | "resume" | "stop";
  }) => Promise<{ readonly status: "suspended" | "sleeping" | "paused" | "cancelled" }>;
  onOpenThread?: (input: { projectId: string; threadId: string }) => void;
  /** The thread this card is rendered in — a step that ran here is not a navigable child. */
  currentThreadId?: string | undefined;
  childStatuses?: Readonly<Record<string, string>>;
}) {
  const [localStatus, setLocalStatus] = useState<OrchestrationWorkflowRunStatus["status"]>();
  const [controlPending, setControlPending] = useState<"pause" | "resume" | "stop" | null>(null);
  const [controlError, setControlError] = useState<string | null>(null);
  // Repair activities are workflow-owned state, not plan steps. Rendering them inline avoids
  // a standalone "Analysing failure" row and keeps the authored plan stable.
  const planRuntimeSteps = progress.steps.filter((step) => step.stepKind !== "workflow.self-heal");
  const visiblePlanSteps = shape.steps.filter((step) => step.label !== "Scheduled work");
  const runtimeStepsForRows = planRuntimeSteps.filter((step) => step.stepKind !== "wait.until");
  const { rows } = reconcileT3TeamWorkflowShapeProgress(visiblePlanSteps, runtimeStepsForRows);
  const activeWait = [...planRuntimeSteps]
    .reverse()
    .find(
      (step) =>
        step.stepKind === "wait.until" && (step.phase === "started" || step.phase === "waiting"),
    );
  const activeWaitAt =
    activeWait === undefined
      ? undefined
      : (workflowRunStatus?.wakeAt ??
        activeWait.detail?.match(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\b/)?.[0]);
  const scheduledPlanRow =
    activeWaitAt === undefined
      ? -1
      : rows.findIndex((row) => row.planStep !== undefined && row.runtimeStep === undefined);
  useEffect(() => {
    if (localStatus === undefined || workflowRunStatus === undefined) return;
    if (
      workflowRunStatus.status === localStatus ||
      ["completed", "failed", "cancelled"].includes(workflowRunStatus.status)
    ) {
      setLocalStatus(undefined);
    }
  }, [localStatus, workflowRunStatus]);
  const serverStatus = workflowRunStatus?.status;
  const status =
    serverStatus === "completed" || serverStatus === "failed" || serverStatus === "cancelled"
      ? serverStatus
      : (localStatus ?? serverStatus ?? inferredRunStatus(progress));
  // Repair entries are historical workflow activity. Once a run is terminal, they must not
  // keep a stale spinner/"Getting orchestration ready" strip visible after Stop succeeds.
  const repair = ["completed", "failed", "cancelled"].includes(status)
    ? null
    : repairStatus(progress.steps);
  const liveLabel =
    status === "cancelled"
      ? "Stopped"
      : status === "completed"
        ? "Completed"
        : status === "failed"
          ? "Failed"
          : liveRunLabel(progress.steps);
  const queued = status === "queued";
  const canPause = status === "suspended" || status === "sleeping";
  const canResume = status === "paused";
  const canStop = queued || status === "running" || canPause || canResume;
  const control = async (action: "pause" | "resume" | "stop") => {
    if (!onControlWorkflow || controlPending !== null) return;
    setControlError(null);
    setControlPending(action);
    try {
      const result = await onControlWorkflow({ workflowRunId: progress.runId, action });
      setLocalStatus(result.status);
    } catch (error) {
      setControlError(workflowControlErrorMessage(error));
    } finally {
      setControlPending(null);
    }
  };

  return (
    <div className="rounded-lg border border-primary/35 bg-background/65 px-4 py-3">
      {queued ? (
        <div className="mb-2 text-xs font-medium text-muted-foreground">
          Queued · starts when capacity is free
        </div>
      ) : null}
      <T3TeamWorkflowRunControlStatus pending={controlPending} error={controlError} />
      <div className="mb-2 flex items-center gap-1.5 text-primary">
        <RouteIcon className="size-3.5" />
        {shape.name ? (
          <span className="text-sm font-semibold text-foreground">{shape.name}</span>
        ) : null}
        {progress.run === null || progress.run.phase === "started" ? (
          <span
            data-run-live-status={liveLabel}
            className="ml-auto flex items-center gap-1 text-[11px] font-medium text-muted-foreground"
          >
            {liveLabel === "Scheduled" ? (
              <ClockIcon className="size-3" />
            ) : (
              <CircleDashedIcon className="size-3" />
            )}
            {liveLabel}
          </span>
        ) : null}
        {onControlWorkflow ? (
          <T3TeamWorkflowRunControls
            canPause={canPause}
            canResume={canResume}
            canStop={canStop}
            pending={controlPending}
            className={
              progress.run === null || progress.run.phase === "started"
                ? "ml-1 flex items-center gap-1"
                : "ml-auto flex items-center gap-1"
            }
            onControl={(action) => void control(action)}
          />
        ) : null}
      </div>
      {shape.description ? (
        <p className="text-sm leading-6 text-muted-foreground">{shape.description}</p>
      ) : null}
      <T3TeamShapeCapabilityChips capabilities={shape.capabilities} />
      {repair ? (
        <RepairStatusStrip
          repair={repair}
          {...(onOpenThread ? { onOpenThread } : {})}
          {...(currentThreadId ? { currentThreadId } : {})}
        />
      ) : null}

      {rows.length > 0 ? (
        <div className="mt-3 space-y-1.5">
          {(() => {
            let priorPlanPhase: string | null = null;
            return rows.map((row, index) => {
              const step = row.runtimeStep;
              const planStep = row.planStep;
              const phaseTitle = planStep?.phase ?? row.phase ?? "Current work";
              const showPhaseHeader = phaseTitle !== null && phaseTitle !== priorPlanPhase;
              if (phaseTitle !== null) priorPlanPhase = phaseTitle;
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
                  <T3TeamWorkflowStepDetails
                    step={step}
                    hideDetail={step?.detail === planStep?.label}
                    redactDetail={step?.stepKind === "workflow.self-heal"}
                    {...(onOpenThread ? { onOpenThread } : {})}
                    {...(currentThreadId ? { currentThreadId } : {})}
                  >
                    {planStep ? (
                      <T3TeamShapeStepRow
                        step={planStep}
                        muted={
                          index !== scheduledPlanRow &&
                          displayedStepStatus(step, status) === "skipped"
                        }
                        leading={
                          <StepStatusIcon
                            status={
                              index === scheduledPlanRow
                                ? "scheduled"
                                : displayedStepStatus(step, status)
                            }
                          />
                        }
                        trailing={
                          <StepTrailing
                            step={step}
                            wakeAt={index === scheduledPlanRow ? activeWaitAt : undefined}
                            childStatuses={childStatuses}
                          />
                        }
                        hideKindLabel={step?.stepKind === "wait.until"}
                      />
                    ) : step ? (
                      <RuntimeStepRow
                        step={step}
                        wakeAt={undefined}
                        runStatus={status}
                        childStatuses={childStatuses}
                      />
                    ) : null}
                  </T3TeamWorkflowStepDetails>
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
