/** The default in-memory registry behind the host-neutral per-run workflow host. */

import type {
  WorkflowHostRegisteredRun,
  WorkflowHostRegistry,
} from "./t3team-sdk.workflowHostTypes.ts";

/** Build a fresh in-memory host-neutral registry. */
export function createWorkflowHostRegistry(): WorkflowHostRegistry {
  const runs = new Map<string, WorkflowHostRegisteredRun>();
  const ownerByRun = new Map<string, string>();
  return {
    registerRun: (runId, run) => {
      runs.set(runId, run);
    },
    deleteRun: (runId) => {
      runs.delete(runId);
      ownerByRun.delete(runId);
    },
    getRun: (runId) => runs.get(runId),
    registerOwnership: (runId, owner) => {
      if (owner === undefined) return;
      ownerByRun.set(runId, owner);
    },
  };
}
