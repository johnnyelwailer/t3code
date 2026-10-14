/* oxlint-disable t3code/no-outset-state-indicators -- Existing merged lint debt; keep green while preserving behavior. */
/**
 * Live plan-card overlay (recipe UX "no black box" slice). Renders the same plan chrome as
 * {@link ./t3team-messageShapeCard.tsx} but overlays each step with its live runtime status
 * derived from `t3team.recipe.workflow.step` activities (spinner=active, check=completed,
 * clock=scheduled timer, error=failed).
 *
 * RECONCILIATION: the shape is a static AST-derived plan; runtime steps arrive by journal seq
 * and may not match 1:1 (loops, parallel branches). The plan is treated as a skeleton —
 * executed steps map onto plan steps by order (i-th executed step ↔ i-th plan step in display
 * order); unknown runtime steps remain in their journal position with a human fallback label;
 * REACHABLE STEPS ONLY: plan steps the run has not reached yet (branch sides, later phases)
 * are not rendered at all — no dimmed placeholders, no counters — and an all-unreached phase
 * draws no header. The run-level terminal activity drives the completed/failed banner.
 *
 * A `waiting` row shows ONLY the waiting state — the ask itself is rendered by the sibling
 * decision card ({@link ./t3team-messageDecisionCard.tsx}); no duplication here.
 *
 * ONE-LINE COLLAPSE: the collapsed state is a single compact row — chevron, the run title
 * (the description, the slug when there is none), the run status chip, and the current step's
 * label if it still fits on the line (ellipsised otherwise). No banner, no description line,
 * no nested disclosure. The whole row is the hit target; the chevron rotates 180° with state
 * and the card body animates open/closed through a CSS `grid-template-rows: 0fr → 1fr` height
 * transition (instant under `prefers-reduced-motion`). There is no per-run persistence — the
 * expansion is local state that resets on remount, like the other disclosures in this card.
 * A problem card never hides its reason: a FAILED run, or one WAITING ON THE USER
 * (decision/ask state), auto-expands and cannot be collapsed back — its row offers no
 * chevron and no toggle.
 */
import { ChevronDownIcon, CircleDashedIcon, ClockIcon } from "lucide-react";
import type { OrchestrationWorkflowRunStatus } from "@t3tools/contracts";
import type { ProjectRecipeWorkflowShapePayload } from "@t3tools/project-recipes";
import { useState } from "react";

import { cn } from "~/lib/utils";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/t3team/components/ui/t3team-tooltip";
import { T3TeamWorkflowNameChip } from "~/t3team/chat/t3team-workflowCardHeadline";
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

/** The collapsed row's status chip and the expanded meta row share one status rendering: a
 * small icon plus the live label, never wrapping (the label is the one mutable part of the
 * card's chrome and the row must stay one line). */
function WorkflowRunStatusChip({ label, icon }: { label: string; icon: "clock" | "dashed" }) {
  return (
    <span
      data-run-live-status={label}
      className="flex shrink-0 items-center gap-1 text-2xs font-medium text-muted-foreground"
    >
      {icon === "clock" ? (
        <ClockIcon className="size-3 shrink-0" />
      ) : (
        <CircleDashedIcon className="size-3 shrink-0" />
      )}
      <span className="max-w-44 truncate">{label}</span>
    </span>
  );
}

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

  // A problem card never hides its reason: a failed run, or one parked on the user's answer
  // (decision/ask state), auto-expands and cannot be collapsed back.
  const waitingOnUser = progress.steps.some(
    (step) => step.stepKind === "user.input" && step.phase === "waiting",
  );
  const autoExpanded = status === "failed" || waitingOnUser;
  const [expandedByUser, setExpandedByUser] = useState(initiallyExpanded ?? false);
  const expanded = expandedByUser || autoExpanded;

  // The run's title: the human description leads, the machine slug stands in when there is
  // none (never an empty row). The full text always stays reachable in the tooltip.
  const title = shape.description || shape.name || "Workflow run";
  // The chip the collapsed row shows. `liveLabel` would misread a pre-run state as "Running"
  // (it has no steps yet), so queued/authoring get their own honest words — the same split
  // the sidebar pill and the pre-run copy below use.
  const chipLabel =
    status === "queued" ? "Queued" : status === "authoring" ? "Authoring" : liveLabel;

  // The run's CURRENT STEP: the last in-progress (started) row in display order — the authored
  // plan label when the row matched an authored step, otherwise the row's own human fallback.
  // No in-progress step → the run-level lifecycle phase (where the run currently sits, e.g.
  // "paused"/"suspended"). A terminal run's position IS its status word — that word lives in
  // the row's end slot, so the step slot stays empty rather than repeating it.
  const terminalStatus = status === "completed" || status === "failed" || status === "cancelled";
  const currentStep = (() => {
    for (let index = rows.length - 1; index >= 0; index -= 1) {
      const row = rows[index]!;
      if (row.runtimeStep?.phase !== "started") continue;
      return row.planStep?.label ?? fallbackRuntimeLabel(row.runtimeStep);
    }
    return terminalStatus ? undefined : progress.run?.phase;
  })();

  const titleNode = (
    <Tooltip>
      <TooltipTrigger
        render={<span className="min-w-0 truncate text-sm font-medium leading-5 text-foreground" />}
      >
        {title}
      </TooltipTrigger>
      <TooltipPopup side="top" align="start" className="max-w-84">
        {title}
      </TooltipPopup>
    </Tooltip>
  );
  const stepNode = currentStep ? (
    <span className="min-w-0 truncate text-2xs font-medium text-muted-foreground">
      {currentStep}
    </span>
  ) : null;

  return (
    <div
      className={cn(
        "@container/workflow-live-card rounded-lg bg-background/65",
        expanded ? "border border-primary/35 px-4 py-3" : "border border-primary/25 px-3 py-1.5",
      )}
      data-workflow-live-card-expanded={expanded ? "true" : "false"}
    >
      {/*
        The one-line header. Collapsed it IS the whole card; expanded it is the card's toggle.
        The whole row is the hit target. Pinned-open (auto-expanded) rows render no chevron and
        no toggle at all — a problem card never hides its reason behind a disabled control.
      */}
      {autoExpanded ? (
        <div className="flex min-w-0 items-center gap-2">
          {titleNode}
          <WorkflowRunStatusChip
            label={chipLabel}
            icon={chipLabel === "Scheduled" ? "clock" : "dashed"}
          />
          {stepNode}
        </div>
      ) : (
        <button
          type="button"
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse workflow card" : "Expand workflow card"}
          {...(expanded
            ? { "data-workflow-live-card-collapse": "" }
            : { "data-workflow-live-card-expand": "" })}
          onClick={() => setExpandedByUser((value) => !value)}
          className="-mx-1.5 flex w-[calc(100%+0.75rem)] min-w-0 items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronDownIcon
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none",
              expanded ? "rotate-180" : undefined,
            )}
            aria-hidden="true"
          />
          {titleNode}
          <WorkflowRunStatusChip
            label={chipLabel}
            icon={chipLabel === "Scheduled" ? "clock" : "dashed"}
          />
          {stepNode}
        </button>
      )}
      {/*
        The card body: everything the expanded card shows — pre-run copy, the slug + live
        status + controls row, the repair strip, the step rows, the terminal banner. It stays
        mounted so the grid-template-rows transition can animate BOTH directions; while
        collapsed the zero-height track hides it and `inert` keeps it out of the a11y tree and
        the tab order. Under `prefers-reduced-motion` the transition is disabled and the state
        flips instantly.
      */}
      <div
        className={cn(
          "grid w-full transition-[grid-template-rows] duration-200 ease-in-out motion-reduce:transition-none",
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div inert={!expanded} className="min-h-0 overflow-hidden">
          <div className="pt-1.5">
            {/*
            Pre-run copy, split by actual state: only `queued` is genuinely capacity-parked, so
            only it may say so. `authoring` is the hidden author writing the plan — it reads
            with the same words as the sidebar pill (one shared source in
            `t3team-workflowRunLabels`), never the capacity line, which was the lie this card
            used to tell for both.
          */}
            {status === "queued" ? (
              <div className="mb-2 mt-1 text-xs font-medium text-muted-foreground">
                Queued · {WORKFLOW_QUEUED_CAPACITY_DETAIL}
              </div>
            ) : status === "authoring" ? (
              <div className="mb-2 mt-1 text-xs font-medium text-muted-foreground">
                {WORKFLOW_AUTHORING_HEADLINE}
              </div>
            ) : null}
            <T3TeamWorkflowRunControlStatus
              pending={controlPending}
              error={controlError}
              isRetry={isRetry}
            />
            {/*
            The slug, the live status, and the controls share one muted, single-line row —
            small, subordinate, and never wrapping. At a narrow container width the row stacks
            instead of squeezing the meta text against the controls; there the machine slug is
            dropped (hidden, not deleted — the wide layout keeps it) so only the live status
            shows. The "·" separator hides with it so a lone dot never dangles.
          */}
            <div className="mb-2 flex min-w-0 flex-col items-start gap-1 @sm/workflow-live-card:flex-row @sm/workflow-live-card:items-center @sm/workflow-live-card:justify-between">
              <div className="flex min-w-0 items-center gap-1.5 text-2xs font-medium text-muted-foreground">
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
                  <WorkflowRunStatusChip
                    label={liveLabel}
                    icon={liveLabel === "Scheduled" ? "clock" : "dashed"}
                  />
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
                {...(canResume && onControlWorkflow
                  ? { onResume: () => void control("resume") }
                  : {})}
                resumePending={controlPending === "resume"}
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
