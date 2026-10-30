import type { BackendApi } from "~/t3team/backend/t3team-types";
import { addRequestToTarget } from "~/t3team/hooks/t3team-addToChatToTarget";
import type { AgentContextCapabilities } from "~/t3team/t3team-agentContext";
import type { AddToChatRequest } from "~/t3team/t3team-addToChatUtils";
import { useT3TeamAddToChatStore } from "~/t3team/t3team-addToChatStore";
import { buildReferenceContextAttachment } from "~/t3team/t3team-referenceContextAttachment";

export function readAddToChatRequest(
  capabilities: AgentContextCapabilities,
): AddToChatRequest | null {
  for (const action of capabilities.actions) {
    if (action.kind === "add-to-chat") return action.request;
  }
  return null;
}

/**
 * Queues a dragged item on a thread's composer. The queue is keyed by thread id in a store, so the
 * composer picks it up whenever it mounts. An item that exposes a fetch tool travels as a
 * reference; the request's payload snapshot is only for items with no tool.
 */
export function addAgentContextToThread(input: {
  capabilities: AgentContextCapabilities;
  threadId: string;
  backend: BackendApi | null | undefined;
}): boolean {
  const request = readAddToChatRequest(input.capabilities);
  if (!request) return false;
  const tool = input.capabilities.tools?.find(
    (candidate) => Object.keys(candidate.arguments ?? {}).length > 0,
  );
  if (tool) {
    useT3TeamAddToChatStore
      .getState()
      .enqueueThreadAttachment(input.threadId, buildReferenceContextAttachment({ request, tool }));
    return true;
  }
  addRequestToTarget({
    request,
    target: { type: "thread", threadId: input.threadId },
    backend: input.backend,
  });
  return true;
}
