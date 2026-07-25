import { CommandId, ThreadId, type OrchestrationCommand } from "@t3tools/contracts";

import type { T3TeamWorkflowEngineRegistryShape } from "./t3team-workflowEngineRegistry.ts";
import { workflowAdmissionQueue } from "./t3team-workflowAdmissionQueue.ts";

export async function stopWorkflowsOwnedByThread(input: {
  readonly registry: T3TeamWorkflowEngineRegistryShape;
  readonly threadId: string;
  readonly createdAt: string;
  readonly dispatch: (command: OrchestrationCommand) => Promise<void>;
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
      await input.dispatch({
        type: "thread.turn.interrupt",
        commandId: CommandId.make(`t3team-master-stop:${runId}:${childThreadId}`),
        threadId: ThreadId.make(childThreadId),
        createdAt: input.createdAt,
      });
    }
  }
}
