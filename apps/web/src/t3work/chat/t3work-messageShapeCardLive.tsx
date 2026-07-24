/* oxlint-disable react/no-array-index-key -- Mirrors the static shape card's list rendering. */
/**
 * Live plan-card overlay (recipe UX "no black box" slice). Renders the same plan chrome as
 * {@link ./t3work-messageShapeCard.tsx} but overlays each step with its live runtime status
 * derived from `t3work.recipe.workflow.step` activities (spinner=active, check=completed,
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
 * decision card ({@link ./t3work-messageDecisionCard.tsx}); no duplication here.
 */
import {
  CheckCircle2Icon,
  ChevronRightIcon,
  CircleAlertIcon,
  CircleDashedIcon,
  ClockIcon,
  EllipsisIcon,
  LoaderCircleIcon,
  PauseIcon,
  PlayIcon,
  RouteIcon,
  SquareIcon,
} from "lucide-react";
import type { OrchestrationWorkflowRunStatus } from "@t3tools/contracts";
import { useEffect, useState } from "react";
import type {
  ProjectRecipeWorkflowShapePayload,
  ProjectRecipeWorkflowStepPhase,
} from "@t3tools/project-recipes";

import { cn } from "~/lib/utils";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "~/t3work/components/ui/t3work-menu";
import { T3workShapeStepRow } from "~/t3work/chat/t3work-messageShapeCard";
import { T3workShapeCapabilityChips } from "~/t3work/chat/t3work-messageShapeCardCapabilities";
import type {
  T3workWorkflowRunProgress,
  T3workWorkflowStepEntry,
} from "~/t3work/chat/t3work-threadWorkflowStepProgress";
import { T3workWorkflowStepDetails } from "~/t3work/chat/t3work-WorkflowStepDetails";
import { reconcileT3workWorkflowShapeProgress } from "./t3work-workflowShapeProgress";

type StepStatus = ProjectRecipeWorkflowStepPhase | "pending" | "scheduled";

const STATUS_META: Record<StepStatus, { Icon: typeof ClockIcon; className: string }> = {
  started: { Icon: LoaderCircleIcon, className: "animate-spin text-primary" },
  completed: { Icon: CheckCircle2Icon, className: "text-emerald-600 dark:text-emerald-400" },
  waiting: { Icon: CircleDashedIcon, className: "text-muted-foreground" },
  scheduled: { Icon: ClockIcon, className: "text-amber-600 dark:text-amber-400" },
  failed: { Icon: CircleAlertIcon, className: "text-destructive" },
  paused: { Icon: PauseIcon, className: "text-muted-foreground" },
  cancelled: { Icon: SquareIcon, className: "text-muted-foreground" },
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

function displayedStepStatus(
  step: T3workWorkflowStepEntry | undefined,
  runStatus?: OrchestrationWorkflowRunStatus["status"],
): StepStatus {
  if (step === undefined) return "pending";
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

function runtimeDetailLabel(detail: string | undefined): string | null {
  if (!detail) return null;
  const normalized = detail.replaceAll(/\s+/g, " ").trim();
  if (!normalized) return null;
  const contractStart = normalized.search(/\bRespond with ONLY\b/i);
  const useful = contractStart > 0 ? normalized.slice(0, contractStart).trim() : normalized;
  return useful.length <= 96 ? useful : `${useful.slice(0, 95)}…`;
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
      // Dynamic agent branches may not have a dedicated authored plan row. The emitted prompt
      // is the clearest useful label; avoid the meaningless implementation label "Agent task".
      return runtimeDetailLabel(step.detail) ?? "Current work";
    case "user.input":
      return "Awaiting your input";
    case "read":
      return "Review information";
    case "act":
      return "Apply changes";
    case "wait.until":
      return "Scheduled work";
    default:
      return "Additional workflow work";
  }
}

export function formatWorkflowStepDue(
  wakeAtIso: string | undefined,
  options: { now?: Date; locale?: string; timeZone?: string } = {},
): string | null {
  if (!wakeAtIso) return null;
  const wakeAt = new Date(wakeAtIso);
  if (Number.isNaN(wakeAt.getTime())) return null;
  const now = options.now ?? new Date();
  const diffMs = wakeAt.getTime() - now.getTime();
  if (diffMs <= 0) return "now";
  if (diffMs < 60_000) return `in ${Math.ceil(diffMs / 1000)} sec`;
  const minutes = Math.ceil(diffMs / 60_000);
  if (minutes < 60) return `in ${minutes} min`;

  const calendarDay = (value: Date) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: options.timeZone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
    })
      .formatToParts(value)
      .reduce<Record<string, string>>((result, part) => {
        result[part.type] = part.value;
        return result;
      }, {});
    return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)) / 86_400_000;
  };
  const daysAway = calendarDay(wakeAt) - calendarDay(now);
  if (daysAway === 0) {
    return new Intl.DateTimeFormat(options.locale, {
      timeZone: options.timeZone,
      hour: "numeric",
      minute: "2-digit",
    }).format(wakeAt);
  }
  if (daysAway === 1) return "tomorrow";
  return new Intl.DateTimeFormat(options.locale, {
    timeZone: options.timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(wakeAt);
}

function StepDue({
  step,
  wakeAt,
}: {
  step: T3workWorkflowStepEntry | undefined;
  wakeAt?: string | null | undefined;
}) {
  if (step?.phase === "completed" || step?.phase === "failed" || step?.phase === "cancelled") {
    return null;
  }
  if (wakeAt === undefined || wakeAt === null) return null;
  const due = formatWorkflowStepDue(wakeAt ?? undefined);
  return due ? (
    <span data-step-due className="shrink-0 text-[11px] text-muted-foreground/70">
      {due}
    </span>
  ) : null;
}

function StepTrailing({
  step,
  wakeAt,
  childStatuses,
}: {
  step: T3workWorkflowStepEntry | undefined;
  wakeAt?: string | null | undefined;
  childStatuses?: Readonly<Record<string, string>> | undefined;
}) {
  const childStatus = step?.threadId ? childStatuses?.[step.threadId] : undefined;
  if (childStatus) {
    return (
      <span
        data-step-child-status={childStatus}
        className="max-w-[45%] shrink-0 truncate text-right text-[11px] font-normal text-muted-foreground/70"
        title={childStatus}
      >
        {childStatus}
      </span>
    );
  }
  return <StepDue step={step} wakeAt={wakeAt} />;
}

/** An executed step the authored plan has no row for (loop iteration, parallel branch, ...). */
function RuntimeStepRow({
  step,
  wakeAt,
  runStatus,
  childStatuses,
}: {
  step: T3workWorkflowStepEntry;
  wakeAt?: string | null | undefined;
  runStatus?: OrchestrationWorkflowRunStatus["status"];
  childStatuses?: Readonly<Record<string, string>> | undefined;
}) {
  return (
    <div className="flex items-center gap-2.5" data-step-runtime="unknown">
      <StepStatusIcon status={displayedStepStatus(step, runStatus)} />
      <span className="min-w-0 flex-1 truncate text-sm text-foreground/90">
        {fallbackRuntimeLabel(step)}
      </span>
      <StepTrailing step={step} wakeAt={wakeAt} childStatuses={childStatuses} />
    </div>
  );
}

function RunStatusBanner({ run }: { run: NonNullable<T3workWorkflowRunProgress["run"]> }) {
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
      <span className="min-w-0 flex-1">
        {failed
          ? "Run failed"
          : paused
            ? "Run paused"
            : cancelled
              ? "Run stopped"
              : "Run completed"}
        {run.error ? <span className="ml-1 opacity-80">— {run.error}</span> : null}
      </span>
    </div>
  );
}

function relativeAge(iso: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

function liveRunLabel(steps: ReadonlyArray<T3workWorkflowStepEntry>): string {
  const pending = [...steps]
    .reverse()
    .find((step) => step.phase === "started" || step.phase === "waiting");
  if (pending === undefined) return "Running";
  const since = pending.updatedAt === undefined ? "" : ` since ${relativeAge(pending.updatedAt)}`;
  if (pending.stepKind === "thread.turn") return `Waiting for agent${since}`;
  if (pending.stepKind === "user.input") return `Waiting for your answer${since}`;
  if (pending.stepKind === "wait.until") return "Scheduled";
  return `Running${since}`;
}

function inferredRunStatus(
  progress: T3workWorkflowRunProgress,
): OrchestrationWorkflowRunStatus["status"] {
  if (
    progress.run?.phase === "completed" ||
    progress.run?.phase === "failed" ||
    progress.run?.phase === "paused" ||
    progress.run?.phase === "cancelled"
  ) {
    return progress.run.phase;
  }
  const active = [...progress.steps]
    .reverse()
    .find((step) => step.phase === "started" || step.phase === "waiting");
  if (active?.stepKind === "wait.until") return "sleeping";
  if (active?.stepKind === "thread.turn" || active?.stepKind === "user.input") {
    return "suspended";
  }
  return "running";
}

function repairStatus(steps: ReadonlyArray<T3workWorkflowStepEntry>): {
  readonly label: string;
  readonly reason?: string;
  readonly step: T3workWorkflowStepEntry;
} | null {
  const latest = [...steps].reverse().find((step) => step.stepKind === "workflow.self-heal");
  if (latest === undefined) return null;
  const reason = [...steps]
    .reverse()
    .find((step) => step.stepKind === "workflow.self-heal" && step.error)?.error;
  if (latest.phase === "failed") return { label: "Needs attention", step: latest };
  if (latest.phase === "completed") return { label: "Workflow ready", step: latest };
  if (latest.detail === "Resuming workflow")
    return { label: "Starting workflow", ...(reason ? { reason } : {}), step: latest };
  // Self-heal/repair internals stay out of normal UI.
  return { label: "Getting workflow ready", ...(reason ? { reason } : {}), step: latest };
}

function RepairStatusStrip({
  repair,
  onOpenThread,
}: {
  repair: NonNullable<ReturnType<typeof repairStatus>>;
  onOpenThread?: (input: { projectId: string; threadId: string }) => void;
}) {
  const { label: status, reason, step } = repair;
  const needsAttention = status === "Needs attention";
  const ready = status === "Workflow ready";
  const activelyPreparing = status === "Getting workflow ready";
  const canOpenThread = Boolean(step.projectId && step.threadId && onOpenThread);
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
      aria-label={canOpenThread ? "Open workflow repair thread" : undefined}
      onClick={() => onOpenThread?.({ projectId: step.projectId!, threadId: step.threadId! })}
    >
      {content}
    </button>
  );
}

export function workflowControlErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/\b404\b|not found/i.test(message)) {
    return "Server restart required to use workflow controls in this development session.";
  }
  return message.trim() || "Workflow control failed. Please try again.";
}

export function T3workWorkflowShapeLiveCard({
  shape,
  progress,
  workflowRunStatus,
  onControlWorkflow,
  onOpenThread,
  childStatuses,
}: {
  shape: ProjectRecipeWorkflowShapePayload;
  progress: T3workWorkflowRunProgress;
  workflowRunStatus?: OrchestrationWorkflowRunStatus;
  onControlWorkflow?: (input: {
    workflowRunId: string;
    action: "pause" | "resume" | "stop";
  }) => Promise<{ readonly status: "suspended" | "sleeping" | "paused" | "cancelled" }>;
  onOpenThread?: (input: { projectId: string; threadId: string }) => void;
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
  const { rows } = reconcileT3workWorkflowShapeProgress(visiblePlanSteps, runtimeStepsForRows);
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
  // keep a stale spinner/"Getting workflow ready" strip visible after Stop succeeds.
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
      {controlPending !== null ? (
        <div className="mb-2 text-xs font-medium text-muted-foreground" role="status">
          {controlPending === "pause"
            ? "Pausing…"
            : controlPending === "resume"
              ? "Resuming…"
              : "Stopping…"}
        </div>
      ) : null}
      {controlError ? (
        <div className="mb-2 text-xs font-medium text-destructive" role="alert">
          {controlError}
        </div>
      ) : null}
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
        {onControlWorkflow && (canPause || canResume || canStop) ? (
          <div
            className={
              progress.run === null || progress.run.phase === "started"
                ? "ml-1 flex items-center gap-1"
                : "ml-auto flex items-center gap-1"
            }
          >
            {canPause ? (
              <button
                type="button"
                disabled={controlPending !== null}
                title="Pause at this safe waiting point"
                aria-label="Pause workflow"
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                onClick={() => void control("pause")}
              >
                <PauseIcon className="size-3.5" />
              </button>
            ) : null}
            {canResume ? (
              <button
                type="button"
                disabled={controlPending !== null}
                title="Resume workflow"
                aria-label="Resume workflow"
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                onClick={() => void control("resume")}
              >
                <PlayIcon className="size-3.5" />
              </button>
            ) : null}
            {canStop ? (
              <Menu>
                <MenuTrigger
                  aria-label="More workflow actions"
                  disabled={controlPending !== null}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                >
                  <EllipsisIcon className="size-3.5" />
                </MenuTrigger>
                <MenuPopup align="end" side="bottom" className="min-w-40">
                  <MenuItem variant="destructive" onClick={() => void control("stop")}>
                    <SquareIcon className="size-3.5" />
                    Stop workflow
                  </MenuItem>
                </MenuPopup>
              </Menu>
            ) : null}
          </div>
        ) : null}
      </div>
      {shape.description ? (
        <p className="text-sm leading-6 text-muted-foreground">{shape.description}</p>
      ) : null}
      <T3workShapeCapabilityChips capabilities={shape.capabilities} />
      {repair ? (
        <RepairStatusStrip repair={repair} {...(onOpenThread ? { onOpenThread } : {})} />
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
                  <T3workWorkflowStepDetails
                    step={step}
                    hideDetail={step?.detail === planStep?.label}
                    redactDetail={step?.stepKind === "workflow.self-heal"}
                    {...(onOpenThread ? { onOpenThread } : {})}
                  >
                    {planStep ? (
                      <T3workShapeStepRow
                        step={planStep}
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
