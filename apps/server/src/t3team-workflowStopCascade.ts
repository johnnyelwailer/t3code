/**
 * A user Stop on a launch thread stops the workflows it launched: their queued admissions are
 * cancelled, their durable rows settle `cancelled` through the master stop, and the active run of
 * every thread they spawned is interrupted.
 */
import { workflowAdmissionQueue } from "./t3team-workflowAdmissionQueue.ts";
import type { T3TeamWorkflowEngineRegistryShape } from "./t3team-workflowEngineRegistry.ts";
import type { WorkflowHostPort } from "./t3team-workflowHostPort.ts";
import { retireWorkflowAuthorThread } from "./t3team-workflowAuthorThreadCleanup.ts";

export async function stopWorkflowsOwnedByThread(input: {
  readonly registry: T3TeamWorkflowEngineRegistryShape;
  readonly threadId: string;
  readonly host: Pick<WorkflowHostPort, "interrupt" | "archiveThread">;
}): Promise<void> {
  for (const runId of input.registry.runsOwnedByThread(input.threadId)) {
    const children = input.registry.childThreadsForRun(runId);
    workflowAdmissionQueue.cancel(runId);
    // Start the durable write while its callback is still registered, then synchronously close
    // the hot run/pending-ask window before awaiting I/O. Otherwise a user reply can validate
    // against the pending ask and resume the workflow while stop is waiting on persistence.
    const durableStop = input.registry.masterStopForRun(runId);
    input.registry.cancelRun(runId);
    await durableStop;
    for (const childThreadId of children) {
      await input.host.interrupt({
        threadId: childThreadId,
        reason: "Workflow stopped",
        origin: "user",
      });
    }
    await retireWorkflowAuthorThread({ runId, host: input.host });
  }
}
