import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { type EnvironmentId, ThreadId } from "@t3tools/contracts";

import { useRightPanelStore } from "~/rightPanelStore";
import { enqueueWorkItemContextSyncRequest } from "~/t3team/hooks/t3team-useWorkItemContextSyncQueue";
import type { T3TeamViewTarget } from "~/t3team/t3team-viewTarget";

export type StartChatHereDeps = {
  readonly environmentId: EnvironmentId | null;
  readonly resolveProjectId: (projectId: string) => string;
  /** The project store's own `createThread`: allocates the id locally, before any server call. */
  readonly createThread: (
    projectId: string,
    options: { viewMode: "thread"; ticketId?: string; ticketDisplayId?: string },
  ) => { readonly id: string };
  readonly openFullThread: (projectId: string, threadId: string) => void;
};

/**
 * Starts a thread from a view and opens it with that view as a tab beside it. Everything on the
 * click path is local: the thread id, the panel tab and the navigation. The server thread is
 * created by the thread route's own bootstrap, which shows its progress and failures in place. A
 * work item reaches the agent through the context sync queue, which the work-item tab drains.
 */
export function startChatHere(deps: StartChatHereDeps, source: T3TeamViewTarget): string {
  const projectId = deps.resolveProjectId(source.projectId);
  const target: T3TeamViewTarget = { ...source, projectId };
  const thread = deps.createThread(
    projectId,
    target.kind === "work-item"
      ? {
          viewMode: "thread",
          ticketId: target.ticketId,
          ...(target.displayId ? { ticketDisplayId: target.displayId } : {}),
        }
      : { viewMode: "thread" },
  );
  if (deps.environmentId !== null) {
    const threadRef = scopeThreadRef(deps.environmentId, ThreadId.make(thread.id));
    useRightPanelStore.getState().openView(threadRef, target);
  }
  if (target.kind === "work-item") {
    enqueueWorkItemContextSyncRequest({
      id: thread.id,
      projectId,
      ticketKey: target.displayId ?? target.ticketId,
      threadId: thread.id,
    });
  }
  deps.openFullThread(projectId, thread.id);
  return thread.id;
}
