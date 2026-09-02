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
  T3TeamWorkflowCardHeadline,
  T3TeamWorkflowNameChip,
} from "~/t3team/chat/t3team-workflowCardHeadline";
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
  outcomeSummary,
}: {
  shape: ProjectRecipeWorkflowShapePayload;
  progress: T3TeamWorkflowRunProgress;
  workflowRunStatus?: OrchestrationWorkflowRunStatus;
  onControlWorkflow?: (input: {
    workflowRunId: string;
    action: "pause" | "resume" | "stop";
  }) => Promise<{ readonly status: "suspended" | "sleeping" | "paused" | "cancelled" | "running" }>;
  onOpenThread?: (input: { projectId: string; threadId: string }) => void;
  /** The thread this card is rendered in — a step that ran here is not a navigable child. */
  currentThreadId?: string | undefined;
  childStatuses?: Readonly<Record<string, string>>;
  /** A short, honest outcome line for the terminal banner (see
   * `findT3TeamWorkflowRunOutcomeSummaries`) — never the full result, which renders in its own
   * message body instead. */
  outcomeSummary?: string | undefined;
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
    isRetry,
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
      <T3TeamWorkflowRunControlStatus
        pending={controlPending}
        error={controlError}
        isRetry={isRetry}
      />
      {/*
        Two rows, not one: the title, the slug, and the live status were all fighting for the
        same line — the title clamped to two lines and still truncated, the slug interrupted it,
        and the status wrapped to three lines of its own. Giving the title the full first row
        means its two-line clamp is a genuine fallback for a long description, not something that
        triggers on every card; the slug and status share a second, muted, single-line row with
        the controls — small, subordinate, and never wrapping.
      */}
      <div className="mb-2 flex min-w-0 items-start gap-1.5 text-primary">
        <RouteIcon className="mt-0.5 size-3.5 shrink-0" />
        <T3TeamWorkflowCardHeadline shape={shape} className="min-w-0" showNameChip={false} />
      </div>
      {/*
        At a narrow container width even this muted second row stacks rather than squeezing the
        meta text against the controls — full width for each instead of both truncating at once.
      */}
      <div className="mb-2 flex min-w-0 flex-col items-start gap-1 @sm/workflow-live-card:flex-row @sm/workflow-live-card:items-center @sm/workflow-live-card:justify-between">
        <div className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          {shape.description && shape.name ? <T3TeamWorkflowNameChip name={shape.name} /> : null}
          {shape.description && shape.name && showLiveStatus ? (
            <span aria-hidden className="shrink-0 text-muted-foreground/50">
              ·
            </span>
          ) : null}
          {showLiveStatus ? (
            <span
              data-run-live-status={liveLabel}
              className="flex min-w-0 items-center gap-1 truncate"
            >
              {liveLabel === "Scheduled" ? (
                <ClockIcon className="size-3 shrink-0" />
              ) : (
                <CircleDashedIcon className="size-3 shrink-0" />
              )}
              <span className="truncate">{liveLabel}</span>
            </span>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <T3TeamWorkflowRunControls
            canPause={canPause}
            canResume={canResume}
            isRetry={isRetry}
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

      {progress.run ? (
        <RunStatusBanner run={progress.run} {...(outcomeSummary ? { outcomeSummary } : {})} />
      ) : null}
    </div>
  );
}
