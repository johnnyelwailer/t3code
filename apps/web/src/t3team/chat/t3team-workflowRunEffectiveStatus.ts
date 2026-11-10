/**
 * One status per run card. The run-level terminal event (`run:<runId>`, the "Run failed: …"
 * banner) and the server's run row can disagree for a moment: the event lands, the row still
 * says "running". The card used to trust the row and drew "Running" next to "Run failed".
 *
 * Rule: a terminal run event wins over a non-terminal server status UNLESS the server row is
 * newer (a Retry re-drive already moved it on). An optimistic local status still wins first.
 *
 * @module t3team-workflowRunEffectiveStatus
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
