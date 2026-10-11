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
 *
 * COLLAPSED BY DEFAULT and never hidden (the house observability-over-gates rule):
 * the collapsed view shows the one-line description, the run's current step, and the run
 * status; the full step list is one click away (row click or chevron, the
 * `T3TeamWorkflowStepGroupRow` disclosure pattern). There is no per-run persistence — the
 * expansion is local state that resets on remount, like the other disclosures in this card.
 * A problem card never hides its reason: a FAILED run, or one WAITING ON THE USER
 * (decision/ask state), auto-expands and cannot be collapsed back.
 */
import { ChevronDownIcon, ChevronUpIcon, CircleDashedIcon, ClockIcon, RouteIcon } from "lucide-react";
import type { OrchestrationWorkflowRunStatus } from "@t3tools/contracts";
import type { ProjectRecipeWorkflowShapePayload } from "@t3tools/project-recipes";
import { useState } from "react";

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
import { fallbackRuntimeLabel } from "~/t3team/chat/t3team-workflowRunStepRow";
import {
  WORKFLOW_AUTHORING_HEADLINE,
  WORKFLOW_QUEUED_CAPACITY_DETAIL,
} from "~/t3team/chat/t3team-workflowRunLabels";
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
  initiallyExpanded,
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
  /** Seeds the local expanded state (stories/tests). No persistence — the card collapses again
   * on remount; a failed or user-waiting run stays expanded regardless. */
  initiallyExpanded?: boolean;
}) {
  const {
    rows,
    activeWaitAt,
    scheduledPlanRow,
    status,
    repair,
    liveLabel,
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

  // Collapsed by default: the disclosure row (current step + status + chevron) stands in for
  // the step list until the reader asks for it.
  const [expandedByUser, setExpandedByUser] = useState(initiallyExpanded ?? false);
  // A problem card never hides its reason: a failed run, or one parked on the user's answer
  // (decision/ask state), auto-expands and cannot be collapsed back.
  const waitingOnUser = progress.steps.some(
    (step) => step.stepKind === "user.input" && step.phase === "waiting",
  );
  const autoExpanded = status === "failed" || waitingOnUser;
  const expanded = expandedByUser || autoExpanded;

  // The run's CURRENT STEP: the last in-progress (started) row in display order — the authored
  // plan label when the row matched an authored step, otherwise the row's own human fallback.
  // No in-progress step → the run-level lifecycle phase (where the run currently sits, e.g.
  // "paused"/"suspended"). A terminal run's position IS its status word — that word lives in
  // the row's end slot, so the step slot stays empty rather than repeating it.
  const terminalStatus =
    status === "completed" || status === "failed" || status === "cancelled";
  const currentStep = (() => {
    for (let index = rows.length - 1; index >= 0; index -= 1) {
      const row = rows[index]!;
      if (row.runtimeStep?.phase !== "started") continue;
      return row.planStep?.label ?? fallbackRuntimeLabel(row.runtimeStep);
    }
    return terminalStatus ? undefined : progress.run?.phase;
  })();

  return (
    <div
      className="@container/workflow-live-card rounded-lg border border-primary/35 bg-background/65 px-4 py-3"
      data-workflow-live-card-expanded={expanded ? "true" : "false"}
    >
      {/*
        Pre-run copy, split by actual state: only `queued` is genuinely capacity-parked, so only
        it may say so. `authoring` is the hidden author writing the plan — it reads with the same
        words as the sidebar pill (one shared source in `t3team-workflowRunLabels`), never the
        capacity line, which was the lie this card used to tell for both.
      */}
      {status === "queued" ? (
        <div className="mb-2 text-xs font-medium text-muted-foreground">
          Queued · {WORKFLOW_QUEUED_CAPACITY_DETAIL}
        </div>
      ) : status === "authoring" ? (
        <div className="mb-2 text-xs font-medium text-muted-foreground">
          {WORKFLOW_AUTHORING_HEADLINE}
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
        <T3TeamWorkflowCardHeadline
          shape={shape}
          className="min-w-0"
          showNameChip={false}
          descriptionLines={expanded ? 2 : 1}
        />
      </div>
      {/*
        At a narrow container width even this muted second row stacks rather than squeezing the
        meta text against the controls — full width for each instead of both truncating at once.
      */}
      <div className="mb-2 flex min-w-0 flex-col items-start gap-1 @sm/workflow-live-card:flex-row @sm/workflow-live-card:items-center @sm/workflow-live-card:justify-between">
        <div className="flex min-w-0 items-center gap-1.5 text-2xs font-medium text-muted-foreground">
          {/*
            Below the narrow-container breakpoint the row stacks instead of a squeezed single
            line, and the slug + status were what overflowed past the card's own edge. There the
            machine slug is dropped (hidden, not deleted — the tooltip and the wide layout keep
            it) so only the live status shows; at >=sm the card is wide enough for both on one
            row and the slug reappears. The "·" separator hides with it so a lone dot never dangles.
          */}
          {shape.description && shape.name ? (
            <T3TeamWorkflowNameChip
              name={shape.name}
              className="hidden @sm/workflow-live-card:inline"
            />
          ) : null}
          {shape.description && shape.name && showLiveStatus ? (
            <span
              aria-hidden
              className="hidden shrink-0 text-muted-foreground/50 @sm/workflow-live-card:inline"
            >
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
      {expanded ? (
        <>
          {repair ? (
            <RepairStatusStrip
              repair={repair}
              {...(onOpenThread ? { onOpenThread } : {})}
              {...(currentThreadId ? { currentThreadId } : {})}
            />
          ) : null}
          {/*
            No collapse affordance while a problem state pins the card open: hiding the reason
            behind a control that cannot be used is worse than not showing the control.
          */}
          {!autoExpanded ? (
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                aria-expanded={true}
                aria-label="Collapse workflow card"
                data-workflow-live-card-collapse
                onClick={() => setExpandedByUser(false)}
                className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-2xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ChevronUpIcon className="size-3" aria-hidden="true" />
                Hide steps
              </button>
            </div>
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
            <RunStatusBanner
              run={progress.run}
              {...(outcomeSummary ? { outcomeSummary } : {})}
              // The durable row's `updatedAt` is the pause instant (nothing else writes a paused
              // row); the pause activity's timestamp is the fallback for a card without run status.
              pausedAt={
                workflowRunStatus?.status === "paused"
                  ? workflowRunStatus.updatedAt
                  : progress.run.updatedAt
              }
              {...(canResume && onControlWorkflow ? { onResume: () => void control("resume") } : {})}
              resumePending={controlPending === "resume"}
            />
          ) : null}
        </>
      ) : (
        // The collapsed view: one-line description (the headline above), the run's current step,
        // the run status, and the chevron — the step list is one click away, never hidden.
        <button
          type="button"
          aria-expanded={false}
          aria-label="Expand workflow card"
          data-workflow-live-card-expand
          onClick={() => setExpandedByUser(true)}
          className="mt-3 flex w-full items-center gap-2 rounded-md border border-border/60 bg-muted/25 px-2.5 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {currentStep ? (
            <span className="min-w-0 flex-1 truncate font-medium text-foreground/80">
              {currentStep}
            </span>
          ) : (
            <span className="min-w-0 flex-1" aria-hidden="true" />
          )}
          {/*
            The header's live-status pill covers every live run; a terminal run hides that pill
            (the banner would have said it — and the banner is expanded-only), so the collapsed
            view carries the terminal status itself. A paused/suspended run is not terminal:
            its lifecycle word (the current-step slot) is the position report.
          */}
          {terminalStatus && !showLiveStatus ? (
            <span
              className="flex shrink-0 items-center gap-1 text-2xs font-medium"
              data-run-live-status={liveLabel}
            >
              {liveLabel === "Scheduled" ? (
                <ClockIcon className="size-3 shrink-0" />
              ) : (
                <CircleDashedIcon className="size-3 shrink-0" />
              )}
              <span className="truncate">{liveLabel}</span>
            </span>
          ) : null}
          <ChevronDownIcon className="size-3.5 shrink-0" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
