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
  // Pre-resolved by the broker BEFORE this dispatch (see the `thread.create` branch in
  // t3team-workflowEngineBroker.ts), on the serialised queue, so the create is ordered against the
  // `thread.turn` it precedes.
  modelSelection: ModelSelection,
): Promise<void> {
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
  // Registered only once the thread EXISTS: the registry drives duplicate suppression, stop
  // cascades and sweepers, so a host refusal (an uninheritable launch checkout, an unreadable
  // project) must leave nothing behind for those readers to act on. The refusal itself travels on
  // in-memory (t3team-workflowChildSpawnRefusals.ts) to the child's next awaited turn.
  deps.registry.registerChildThread(deps.runId, payload.threadId);
}
