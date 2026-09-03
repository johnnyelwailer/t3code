/**
 * Everything `T3TeamWorkflowShapeLiveCard` needs to know before it can draw a frame: which plan
 * rows to show, what the run's effective status is, and the pause/resume/stop handler.
 *
 * Split from the card because it is all state and derivation with no markup, and because the
 * status rule is subtle enough to deserve reading on its own: a local, optimistic status wins over
 * the server's while a control call is in flight, EXCEPT once the server reports a terminal state —
 * otherwise a stale optimistic value would keep a spinner alive after Stop already succeeded.
 */
import { useEffect, useState } from "react";
import type { ProjectRecipeWorkflowShapePayload } from "@t3tools/project-recipes";
import type { OrchestrationWorkflowRunStatus } from "@t3tools/contracts";

import type { T3TeamWorkflowRunProgress } from "~/t3team/chat/t3team-threadWorkflowStepProgress";
import {
  inferredRunStatus,
  liveRunLabel,
  repairStatus,
} from "~/t3team/chat/t3team-workflowRunLabels";
import { reconcileT3TeamWorkflowShapeProgress } from "./t3team-workflowShapeProgress";
import { foldAdjacentThreadTurnRows } from "./t3team-workflowShapeThreadTurnFold";

const TERMINAL = new Set(["completed", "failed", "cancelled"]);
// Stricter than TERMINAL: these two can never transition again, so the server always wins over a
// stale optimistic value. "failed" is deliberately excluded — a retry's optimistic "running" must
// survive until the server actually reports the re-drive, or the click would flash right back to
// the failed card it was meant to leave. A NEW "failed" (the re-drive settling again) reconciles
// instead via `controlBaselineUpdatedAt` below — status alone can't tell "still the pre-click
// failure" from "the retry failed too", but the run's `updatedAt` can.
const FORCE_SERVER_STATUS = new Set(["completed", "cancelled"]);

export function workflowControlErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/\b404\b|not found/i.test(message)) {
    return "Server restart required to use orchestration controls in this development session.";
  }
  return message.trim() || "Orchestration control failed. Please try again.";
}

export function useT3TeamWorkflowShapeLiveState(input: {
  shape: ProjectRecipeWorkflowShapePayload;
  progress: T3TeamWorkflowRunProgress;
  workflowRunStatus?: OrchestrationWorkflowRunStatus;
  onControlWorkflow?: (input: {
    workflowRunId: string;
    action: "pause" | "resume" | "stop";
  }) => Promise<{ readonly status: "suspended" | "sleeping" | "paused" | "cancelled" | "running" }>;
}) {
  const { shape, progress, workflowRunStatus, onControlWorkflow } = input;
  const [localStatus, setLocalStatus] = useState<OrchestrationWorkflowRunStatus["status"]>();
  // The server run's `updatedAt` at the moment a control call was made — the discriminator that
  // tells "the server hasn't caught up yet" apart from "the server settled again, to the same
  // status". Cleared alongside `localStatus`.
  const [controlBaselineUpdatedAt, setControlBaselineUpdatedAt] = useState<string>();
  const [controlPending, setControlPending] = useState<"pause" | "resume" | "stop" | null>(null);
  const [controlError, setControlError] = useState<string | null>(null);

  // Repair activities are workflow-owned state, not plan steps. Rendering them inline avoids
  // a standalone "Analysing failure" row and keeps the authored plan stable.
  const planRuntimeSteps = progress.steps.filter((step) => step.stepKind !== "workflow.self-heal");
  const visiblePlanSteps = shape.steps.filter((step) => step.label !== "Scheduled work");
  const runtimeStepsForRows = planRuntimeSteps.filter((step) => step.stepKind !== "wait.until");
  const { rows: reconciledRows } = reconcileT3TeamWorkflowShapeProgress(
    visiblePlanSteps,
    runtimeStepsForRows,
  );
  // Row identity for a delegated step is the child thread, not the individual turn — fold before
  // anything downstream (the dynamic by-label grouping, the scheduled-wait row lookup just below)
  // computes a position against these rows. See `t3team-workflowShapeThreadTurnFold.ts`.
  const rows = foldAdjacentThreadTurnRows(reconciledRows);
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
      FORCE_SERVER_STATUS.has(workflowRunStatus.status) ||
      // The server settled to a NEW run state since the click (e.g. the re-drive failed again) —
      // whatever its status, it is fresher than the optimistic value, so let it win.
      (controlBaselineUpdatedAt !== undefined &&
        workflowRunStatus.updatedAt !== controlBaselineUpdatedAt)
    ) {
      setLocalStatus(undefined);
      setControlBaselineUpdatedAt(undefined);
    }
  }, [localStatus, workflowRunStatus, controlBaselineUpdatedAt]);

  const serverStatus = workflowRunStatus?.status;
  const status = FORCE_SERVER_STATUS.has(serverStatus ?? "")
    ? (serverStatus as "completed" | "cancelled")
    : (localStatus ?? serverStatus ?? inferredRunStatus(progress));
  // Repair entries are historical workflow activity. Once a run is terminal, they must not
  // keep a stale spinner/"Getting orchestration ready" strip visible after Stop succeeds.
  const repair = TERMINAL.has(status) ? null : repairStatus(progress.steps);
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
  // A failed run is resumable too (Epic 25 journal re-drive): the server is the source of truth on
  // whether a given run can actually replay from its journal, and answers a non-resumable one with
  // a control error surfaced via `controlError` — this just decides whether to show the button.
  const canResume = status === "paused" || status === "failed";
  const isRetry = status === "failed";

  const control = async (action: "pause" | "resume" | "stop") => {
    if (!onControlWorkflow || controlPending !== null) return;
    setControlError(null);
    setControlPending(action);
    setControlBaselineUpdatedAt(workflowRunStatus?.updatedAt);
    try {
      const result = await onControlWorkflow({ workflowRunId: progress.runId, action });
      setLocalStatus(result.status);
    } catch (error) {
      setControlError(workflowControlErrorMessage(error));
    } finally {
      setControlPending(null);
    }
  };

  return {
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
    // Not `canResume`: a failed run is resumable (Retry) but has no live controller to stop until
    // that retry starts, at which point `status` is the optimistic "running" already covered below.
    canStop: queued || status === "running" || canPause || status === "paused",
    control,
    controlPending,
    controlError,
  };
}
