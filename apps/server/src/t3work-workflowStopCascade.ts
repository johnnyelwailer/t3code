import { CommandId, ThreadId, type OrchestrationCommand } from "@t3tools/contracts";

import type { T3workWorkflowEngineRegistryShape } from "./t3work-workflowEngineRegistry.ts";
import { workflowAdmissionQueue } from "./t3work-workflowAdmissionQueue.ts";

export async function stopWorkflowsOwnedByThread(input: {
  readonly registry: T3workWorkflowEngineRegistryShape;
  readonly threadId: string;
  readonly createdAt: string;
  readonly dispatch: (command: OrchestrationCommand) => Promise<void>;
}): Promise<void> {
  for (const runId of input.registry.runsOwnedByThread(input.threadId)) {
    const children = input.registry.childThreadsForRun(runId);
    workflowAdmissionQueue.cancel(runId);
    await input.registry.masterStopForRun(runId);
    input.registry.cancelRun(runId);
    for (const childThreadId of children) {
      await input.dispatch({
        type: "thread.turn.interrupt",
        commandId: CommandId.make(`t3work-master-stop:${runId}:${childThreadId}`),
        threadId: ThreadId.make(childThreadId),
        createdAt: input.createdAt,
      });
    }
  }
}
