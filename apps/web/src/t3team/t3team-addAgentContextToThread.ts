import type { ScopedThreadRef } from "@t3tools/contracts";

import { randomUUID } from "~/lib/utils";
import {
  registerContextCacheJob,
  runContextCacheJob,
  type ContextCacheEnvironment,
} from "~/t3team/t3team-contextCacheJob";
import type { AgentContextCapabilities } from "~/t3team/t3team-agentContext";
import type { AddToChatRequest } from "~/t3team/t3team-addToChatUtils";
import { useT3TeamAddToChatStore } from "~/t3team/t3team-addToChatStore";
import { buildContextPointerAttachment } from "~/t3team/t3team-referenceContextAttachment";

export function readAddToChatRequest(
  capabilities: AgentContextCapabilities,
): AddToChatRequest | null {
  for (const action of capabilities.actions) {
    if (action.kind === "add-to-chat") return action.request;
  }
  return null;
}

/**
 * Queues a dragged item on a thread's composer as a compact pointer chip, synchronously. The queue
 * is keyed by thread id in a store, so the composer picks it up whenever it mounts. Returns the
 * function that starts the cached-copy write; the caller navigates first and then calls it.
 */
export function addAgentContextToThread(input: {
  capabilities: AgentContextCapabilities;
  threadRef: ScopedThreadRef;
}): ((environment: ContextCacheEnvironment) => void) | null {
  const request = readAddToChatRequest(input.capabilities);
  if (!request) return null;
  const tool = input.capabilities.tools?.find(
    (candidate) => Object.keys(candidate.arguments ?? {}).length > 0,
  );
  const id = randomUUID();
  const addedAt = new Date().toISOString();
  registerContextCacheJob(id, { request, threadRef: input.threadRef, tool, addedAt });
  useT3TeamAddToChatStore
    .getState()
    .enqueueThreadAttachment(
      input.threadRef.threadId,
      buildContextPointerAttachment({ id, request, tool, addedAt, state: { status: "pending" } }),
    );
  return (environment) => runContextCacheJob(id, environment);
}
