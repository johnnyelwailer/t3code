import type { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";

import { appAtomRegistry } from "./atom-registry";
import { type FirstTurnContext, withFirstTurnContext } from "./t3team-firstTurnContext";
import {
  threadOutboxManager,
  threadOutboxRevision,
  updateThreadOutboxMessage,
} from "./thread-outbox";
import { flattenQueuedThreadMessages, type QueuedThreadMessage } from "./thread-outbox-model";

export interface QueuedCreationTarget {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
}

export interface QueuedRetargetResult {
  /** False while anything is left on `from` (unreadable queue, dispatch, write failure); retry. */
  readonly complete: boolean;
  /** The threads this call found on `from` that now have nothing left there. */
  readonly movedThreadIds: ReadonlyArray<ThreadId>;
}

const MAX_PASSES = 3;

/**
 * A new task queued on the placeholder environment `from`, moved onto `to`: same thread and message
 * ids, so it is still delivered once. The creation drops its workspace path; delivery reads the
 * real project's. Null for a follow-up or a message on another environment.
 */
export function retargetQueuedCreation(
  message: QueuedThreadMessage,
  from: QueuedCreationTarget,
  to: QueuedCreationTarget,
): QueuedThreadMessage | null {
  const creation = message.creation;
  if (creation === undefined || message.environmentId !== from.environmentId) return null;
  const { projectCwd: _projectCwd, ...kept } = creation;
  return {
    ...message,
    environmentId: to.environmentId,
    creation: { ...kept, projectId: to.projectId },
  };
}

/** Every message on the placeholder environment, each thread's creation first, then queue order. */
function queuedOn(from: QueuedCreationTarget): QueuedThreadMessage[] {
  return flattenQueuedThreadMessages(
    appAtomRegistry.get(threadOutboxManager.queuedMessagesByThreadKeyAtom),
  )
    .filter((message) => message.environmentId === from.environmentId)
    .sort(
      (left, right) =>
        Number(right.creation !== undefined) - Number(left.creation !== undefined) ||
        left.createdAt.localeCompare(right.createdAt),
    );
}

/**
 * Moves everything queued on a pending draft's placeholder environment (`from`, unique to the
 * draft, never connectable) onto `to`, with `firstTurnContext` on each creation. Never touches a
 * message being dispatched and never throws; complete only when nothing is left on `from`.
 */
export async function retargetQueuedCreations(
  from: QueuedCreationTarget,
  to: QueuedCreationTarget,
  firstTurnContext?: FirstTurnContext,
): Promise<QueuedRetargetResult> {
  const seen = new Set<ThreadId>();
  const result = (): QueuedRetargetResult => {
    const left = queuedOn(from);
    const leftThreads = new Set(left.map((message) => message.threadId));
    return {
      complete: left.length === 0,
      movedThreadIds: [...seen].filter((threadId) => !leftThreads.has(threadId)),
    };
  };
  try {
    if (!(await threadOutboxManager.load())) return { complete: false, movedThreadIds: [] };
    const { dispatchingQueuedMessageIdAtom } = await import("./use-thread-outbox");
    for (let pass = 0; pass < MAX_PASSES; pass += 1) {
      const queued = queuedOn(from);
      if (queued.length === 0) break;
      const dispatching = appAtomRegistry.get(dispatchingQueuedMessageIdAtom);
      // A thread whose message could not move keeps its later messages for the next pass.
      const blocked = new Set<ThreadId>();
      for (const message of queued) {
        seen.add(message.threadId);
        if (blocked.has(message.threadId)) continue;
        const moved =
          message.creation === undefined
            ? { ...message, environmentId: to.environmentId }
            : withFirstTurnContext(retargetQueuedCreation(message, from, to)!, firstTurnContext);
        if (
          message.messageId === dispatching ||
          !(await updateThreadOutboxMessage(moved, threadOutboxRevision(message.messageId)))
        ) {
          blocked.add(message.threadId);
        }
      }
    }
  } catch (error) {
    console.warn("[thread-outbox] could not move the tasks queued on a pending draft", error);
  }
  return result();
}
