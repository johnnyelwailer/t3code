import type { OrchestrationWorkflowRunStatus } from "@t3tools/contracts";

import type { getT3TeamWorkflowDecisionAttachment } from "~/t3team/chat/t3team-messageDecisionCard";
import type { T3TeamWorkflowRunProgress } from "~/t3team/chat/t3team-threadWorkflowStepProgress";

/**
 * Whether a workflow question can still be answered, and what to say when it cannot.
 *
 * Two independent sources can retire a question, which is why this is not a one-line check: the
 * historical run phase recorded on the message's own progress, and the live run status. Either
 * reaching a terminal state means the answer would go nowhere.
 */
const TERMINAL_WORKFLOW_STATUSES = new Set(["completed", "failed", "cancelled"]);

export function workflowDecisionUnavailableMessage(
  decision: ReturnType<typeof getT3TeamWorkflowDecisionAttachment>,
  workflowRunStatus: OrchestrationWorkflowRunStatus | undefined,
  workflowRunProgress: T3TeamWorkflowRunProgress | undefined,
): string | undefined {
  if (!decision) {
    return undefined;
  }
  const historicalTerminalPhase = workflowRunProgress?.run?.phase;
  const currentRunTerminalStatus =
    workflowRunStatus !== undefined &&
    workflowRunStatus.runId === decision.workflowRunId &&
    TERMINAL_WORKFLOW_STATUSES.has(workflowRunStatus.status)
      ? workflowRunStatus.status
      : undefined;
  const terminalStatus =
    historicalTerminalPhase !== undefined && TERMINAL_WORKFLOW_STATUSES.has(historicalTerminalPhase)
      ? historicalTerminalPhase
      : currentRunTerminalStatus;
  if (terminalStatus === undefined) {
    return undefined;
  }
  return terminalStatus === "cancelled"
    ? "This question is no longer available because the orchestration was stopped."
    : "This question is no longer available because the orchestration has ended.";
}
