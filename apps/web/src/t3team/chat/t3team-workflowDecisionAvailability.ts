import type { OrchestrationWorkflowRunStatus } from "@t3tools/contracts";

import type { getT3TeamWorkflowDecisionAttachment } from "~/t3team/chat/t3team-messageDecisionCard";
import type { T3TeamWorkflowRunProgress } from "~/t3team/chat/t3team-threadWorkflowStepProgress";

/**
 * Whether a workflow question can still be answered, and what to say when it cannot.
 *
 * Two independent sources can retire a question, which is why this is not a one-line check: the
 * historical run phase recorded on the message's own progress, and the live run status. Either
 * reaching a terminal state means the answer would go nowhere.
 *
 * An ALREADY-ANSWERED question is never unavailable, whatever the run went on to do. "No longer
 * available" is a statement about a question you can still act on, and answering it is precisely
 * what stops it being one — so without the `isAnswered` guard every settled card lost its answer
 * the moment the run completed, which is every card in a run that ends normally (seen live
 * 2026-08-29: three answered cards all replaced their choice chips with the terminal message).
 */
const TERMINAL_WORKFLOW_STATUSES = new Set(["completed", "failed", "cancelled"]);

export function workflowDecisionUnavailableMessage(
  decision: ReturnType<typeof getT3TeamWorkflowDecisionAttachment>,
  workflowRunStatus: OrchestrationWorkflowRunStatus | undefined,
  workflowRunProgress: T3TeamWorkflowRunProgress | undefined,
  isAnswered: boolean,
): string | undefined {
  if (!decision || isAnswered) {
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
