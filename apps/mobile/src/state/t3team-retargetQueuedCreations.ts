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
  /** False when the queue could not be read or a message could not move yet; retrying is safe. */
  readonly complete: boolean;
  /** The draft's threads this call found on `from` that now have nothing left there. */
  readonly movedThreadIds: ReadonlyArray<ThreadId>;
}

const MAX_PASSES = 3;

/**
 * A message of a new task queued on `from`, moved onto `to`: same thread and message ids, so it is
 * still delivered once. The creation drops its workspace path; delivery reads the real project's.
 */
export function retargetQueuedCreation(
  message: QueuedThreadMessage,
  from: QueuedCreationTarget,
  to: QueuedCreationTarget,
): QueuedThreadMessage | null {
  const creation = message.creation;
  if (
    creation === undefined ||
    message.environmentId !== from.environmentId ||
    creation.projectId !== from.projectId
  ) {
    return null;
  }
  const { projectCwd: _projectCwd, ...kept } = creation;
  return {
    ...message,
    environmentId: to.environmentId,
    creation: { ...kept, projectId: to.projectId },
  };
}

/**
 * The messages to move, in queue order: each new task on `from` and every message queued in its
 * thread there, also when an earlier call already moved the creation to `to`.
 */
export function planQueuedRetarget(
  queued: ReadonlyArray<QueuedThreadMessage>,
  from: QueuedCreationTarget,
  to: QueuedCreationTarget,
): { readonly messages: QueuedThreadMessage[] } {
  const threadIds = new Set<ThreadId>();
  for (const message of queued) {
    const on = (target: QueuedCreationTarget) =>
      message.environmentId === target.environmentId &&
      message.creation?.projectId === target.projectId;
    if (on(from) || on(to)) threadIds.add(message.threadId);
  }
  const messages = queued
    .filter(
      (message) => message.environmentId === from.environmentId && threadIds.has(message.threadId),
    )
    .sort(
      (left, right) =>
        Number(right.creation !== undefined) - Number(left.creation !== undefined) ||
        left.createdAt.localeCompare(right.createdAt),
    );
  return { messages };
}

/**
 * Moves every thread queued from a pending draft's placeholder (`from`, unique to the draft) onto
 * `to`, creation first, with `firstTurnContext` on the creation. Never touches a message being
 * dispatched; re-reads and retries a message changed meanwhile.
 */
export async function retargetQueuedCreations(
  from: QueuedCreationTarget,
  to: QueuedCreationTarget,
  firstTurnContext?: FirstTurnContext,
): Promise<QueuedRetargetResult> {
  if (!(await threadOutboxManager.load())) return { complete: false, movedThreadIds: [] };
  const { dispatchingQueuedMessageIdAtom } = await import("./use-thread-outbox");
  const read = () =>
    planQueuedRetarget(
      flattenQueuedThreadMessages(
        appAtomRegistry.get(threadOutboxManager.queuedMessagesByThreadKeyAtom),
      ),
      from,
      to,
    );
  const seen = new Set<ThreadId>();
  const result = (complete: boolean): QueuedRetargetResult => {
    const left = new Set(read().messages.map((message) => message.threadId));
    return { complete, movedThreadIds: [...seen].filter((threadId) => !left.has(threadId)) };
  };
  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    const plan = read();
    const dispatching = appAtomRegistry.get(dispatchingQueuedMessageIdAtom);
    const blocked = new Set<ThreadId>();
    let lost = false;
    for (const message of plan.messages) {
      seen.add(message.threadId);
      if (blocked.has(message.threadId)) continue;
      if (message.messageId === dispatching) {
        blocked.add(message.threadId);
        continue;
      }
      const moved =
        message.creation === undefined
          ? { ...message, environmentId: to.environmentId }
          : withFirstTurnContext(retargetQueuedCreation(message, from, to)!, firstTurnContext);
      const revision = threadOutboxRevision(message.messageId);
      if (!(await updateThreadOutboxMessage(moved, revision))) {
        // Keep the thread's order: its later messages wait for the re-read.
        blocked.add(message.threadId);
        lost = true;
      }
    }
    if (!lost) return result(blocked.size === 0);
  }
  return result(false);
}
