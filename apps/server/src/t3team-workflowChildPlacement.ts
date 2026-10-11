/**
 * Spawning a workflow's child thread (`spawnThread` / one-shot `agent()`).
 *
 * The child is linked under the run's launch thread as a `subagent` child (V2 lineage, the one
 * relation source sidebars, cascades and sweepers read), whether it is kept (`retained`) or a
 * one-shot helper (`ephemeral`). Retention rides the fork thread facts so a roster can hide
 * finished one-shot helpers while their parent still links to them. A headless run (no launch
 * thread) spawns top-level threads.
 */
import type { ModelSelection } from "@t3tools/contracts";

import type {
  ThreadCreatePayload,
  WorkflowEngineBrokerDeps,
} from "./t3team-workflowEngineBrokerTypes.ts";

export async function createWorkflowChild(
  deps: WorkflowEngineBrokerDeps,
  payload: ThreadCreatePayload,
  // Pre-resolved by the broker BEFORE this fire-and-forget path (see the `thread.create`
  // branch in t3team-workflowEngineBroker.ts) so validation failures reject the send.
  modelSelection: ModelSelection,
): Promise<void> {
  deps.registry.registerChildThread(deps.runId, payload.threadId);
  await deps.host.createThread({
    threadId: payload.threadId,
    projectId: deps.projectId,
    title: payload.name ?? "Workflow thread",
    modelSelection,
    runtimeMode: deps.runtimeMode,
    interactionMode: deps.interactionMode,
    retention: payload.retention ?? "ephemeral",
    ...(deps.launchThreadId === undefined ? {} : { parentThreadId: deps.launchThreadId }),
    ...(payload.checkout === "launch-thread" ? { inheritCheckout: true } : {}),
  });
}
