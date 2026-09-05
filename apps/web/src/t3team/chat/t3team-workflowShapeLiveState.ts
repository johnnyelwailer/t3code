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
  }) => Promise<{ readonly status: "suspended" | "sleeping" | "paused" | "cancelled" }>;
}) {
  const { shape, progress, workflowRunStatus, onControlWorkflow } = input;
  const [localStatus, setLocalStatus] = useState<OrchestrationWorkflowRunStatus["status"]>();
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
    if (workflowRunStatus.status === localStatus || TERMINAL.has(workflowRunStatus.status)) {
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
  const canResume = status === "paused";

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
    canStop: queued || status === "running" || canPause || canResume,
    control,
    controlPending,
    controlError,
  };
}
