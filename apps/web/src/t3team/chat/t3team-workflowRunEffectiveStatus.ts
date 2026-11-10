/**
 * A terminal run event ("Run failed: …") beats a stale non-terminal server row, so a failed card
 * never also says "Running". A newer server row (a Retry re-drive) still wins.
 */
import type { OrchestrationWorkflowRunStatus } from "@t3tools/contracts";

import type { T3TeamWorkflowRunProgress } from "~/t3team/chat/t3team-threadWorkflowStepProgress";

type RunStatus = OrchestrationWorkflowRunStatus["status"];

const TERMINAL_RUN_PHASES = new Set(["completed", "failed", "cancelled"]);

/** The terminal phase of the run event, when it is at least as fresh as the server row. */
export function terminalRunEventStatus(
  progress: Pick<T3TeamWorkflowRunProgress, "run">,
  workflowRunStatus: Pick<OrchestrationWorkflowRunStatus, "status" | "updatedAt"> | undefined,
): RunStatus | undefined {
  const run = progress.run;
  if (run === null || !TERMINAL_RUN_PHASES.has(run.phase)) return undefined;
  if (workflowRunStatus === undefined) return run.phase as RunStatus;
  if (TERMINAL_RUN_PHASES.has(workflowRunStatus.status)) return undefined;
  // No event timestamp: freshness is unknown, so the server row keeps the last word.
  const serverIsNewer = run.updatedAt === undefined || workflowRunStatus.updatedAt > run.updatedAt;
  return serverIsNewer ? undefined : (run.phase as RunStatus);
}
