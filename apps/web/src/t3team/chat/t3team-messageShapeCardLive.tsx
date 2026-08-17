/* oxlint-disable t3code/no-native-title-tooltip -- Existing merged lint debt; keep green while preserving behavior. */
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
import { CircleDashedIcon, ClockIcon, RouteIcon } from "lucide-react";
import type { OrchestrationWorkflowRunStatus } from "@t3tools/contracts";
import type { ProjectRecipeWorkflowShapePayload } from "@t3tools/project-recipes";

import {
  T3TeamWorkflowRunControls,
  T3TeamWorkflowRunControlStatus,
  type WorkflowRunControlAction,
} from "~/t3team/chat/t3team-workflowRunControls";
import { T3TeamWorkflowShapeStepRows } from "~/t3team/chat/t3team-WorkflowShapeStepRows";
import type { T3TeamWorkflowRunProgress } from "~/t3team/chat/t3team-threadWorkflowStepProgress";
import { RepairStatusStrip, RunStatusBanner } from "~/t3team/chat/t3team-workflowRunBanner";
export { formatWorkflowStepDue } from "~/t3team/chat/t3team-workflowRunLabels";
import {
  useT3TeamWorkflowShapeLiveState,
  workflowControlErrorMessage,
} from "~/t3team/chat/t3team-workflowShapeLiveState";

export { workflowControlErrorMessage };

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
  const {
    rows,
    activeWaitAt,
    scheduledPlanRow,
    status,
    repair,
    liveLabel,
    queued,
    canPause,
    canResume,
    canStop,
    control,
    controlPending,
    controlError,
  } = useT3TeamWorkflowShapeLiveState({
    shape,
    progress,
    ...(workflowRunStatus ? { workflowRunStatus } : {}),
    ...(onControlWorkflow ? { onControlWorkflow } : {}),
  });

  const showLiveStatus = progress.run === null || progress.run.phase === "started";

  return (
    <div className="@container/workflow-live-card rounded-lg border border-primary/35 bg-background/65 px-4 py-3">
      {queued ? (
        <div className="mb-2 text-xs font-medium text-muted-foreground">
          Queued · starts when capacity is free
        </div>
      ) : null}
      <T3TeamWorkflowRunControlStatus pending={controlPending} error={controlError} />
      <div className="mb-2 flex items-start justify-between gap-1.5">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 @sm/workflow-live-card:flex-row @sm/workflow-live-card:items-center @sm/workflow-live-card:gap-1.5">
          <div className="flex min-w-0 items-center gap-1.5 text-primary">
            <RouteIcon className="size-3.5 shrink-0" />
            {shape.name ? (
              <span
                className="min-w-0 truncate text-sm font-semibold text-foreground"
                title={shape.name}
              >
                {shape.name}
              </span>
            ) : null}
          </div>
          {showLiveStatus ? (
            <span
              data-run-live-status={liveLabel}
              className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground @sm/workflow-live-card:ml-auto"
            >
              {liveLabel === "Scheduled" ? (
                <ClockIcon className="size-3" />
              ) : (
                <CircleDashedIcon className="size-3" />
              )}
              {liveLabel}
            </span>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <T3TeamWorkflowRunControls
            canPause={canPause}
            canResume={canResume}
            canStop={canStop}
            pending={controlPending}
            className="flex items-center gap-1"
            {...(shape.capabilities ? { capabilities: shape.capabilities } : {})}
            {...(onControlWorkflow
              ? { onControl: (action: WorkflowRunControlAction) => void control(action) }
              : {})}
          />
        </div>
      </div>
      {shape.description ? (
        <p className="text-sm leading-6 text-muted-foreground">{shape.description}</p>
      ) : null}
      {repair ? (
        <RepairStatusStrip
          repair={repair}
          {...(onOpenThread ? { onOpenThread } : {})}
          {...(currentThreadId ? { currentThreadId } : {})}
        />
      ) : null}

      {rows.length > 0 ? (
        <T3TeamWorkflowShapeStepRows
          rows={rows}
          status={status}
          scheduledPlanRow={scheduledPlanRow}
          activeWaitAt={activeWaitAt}
          {...(childStatuses ? { childStatuses } : {})}
          {...(onOpenThread ? { onOpenThread } : {})}
          {...(currentThreadId ? { currentThreadId } : {})}
        />
      ) : (
        <p className="mt-3 text-xs text-muted-foreground/70">No steps to preview.</p>
      )}

      {progress.run ? <RunStatusBanner run={progress.run} /> : null}
    </div>
  );
}
