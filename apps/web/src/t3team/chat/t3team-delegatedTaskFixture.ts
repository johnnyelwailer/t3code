import {
  NodeId,
  type OrchestrationV2Subagent,
  ProviderDriverKind,
  ProviderInstanceId,
  RunId,
  ThreadId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";

const at = DateTime.makeUnsafe("2026-10-26T14:20:00.000Z");

/**
 * A delegated task as the orchestration read model delivers it to the web app (finished, its
 * completion wake not yet delivered). Shared by the unit test, the browser test and the stories so
 * all three feed the real `deriveAwaitingResultEntries` instead of hand-shaped chip entries.
 */
export function delegatedTaskFixture(
  id: string,
  overrides: Partial<OrchestrationV2Subagent> = {},
): OrchestrationV2Subagent {
  return {
    id: NodeId.make(id),
    threadId: ThreadId.make("parent"),
    runId: RunId.make("parent-run"),
    parentNodeId: NodeId.make("parent-root"),
    origin: "app_owned",
    createdBy: "agent",
    driver: ProviderDriverKind.make("pi"),
    providerInstanceId: ProviderInstanceId.make("nexplore"),
    providerThreadId: null,
    childThreadId: ThreadId.make(`${id}-thread`),
    nativeTaskRef: null,
    prompt: "Triage open issues",
    title: "Triage open issues",
    model: null,
    completionWake: "always",
    completionDelivery: { state: "pending", observedByRunId: null },
    status: "completed",
    result: "done",
    startedAt: at,
    completedAt: at,
    updatedAt: at,
    ...overrides,
  };
}
