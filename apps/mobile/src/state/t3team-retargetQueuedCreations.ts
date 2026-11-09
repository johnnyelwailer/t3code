import type { EnvironmentId, ProjectId } from "@t3tools/contracts";

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

/**
 * A new-task message queued on `from`, moved onto `to`: same thread and message ids, so it is still
 * delivered once. The workspace path is dropped; delivery reads the real project's. Null when the
 * message is not a new task queued on `from`.
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
 * Rewrites every new task queued on `from` (a pending draft's placeholder, whose environment never
 * connects, so nothing there is in flight) onto `to`, with `firstTurnContext` attached. A message
 * changed meanwhile keeps its newer revision.
 */
export async function retargetQueuedCreations(
  from: QueuedCreationTarget,
  to: QueuedCreationTarget,
  firstTurnContext?: FirstTurnContext,
): Promise<void> {
  await threadOutboxManager.load();
  const queued = flattenQueuedThreadMessages(
    appAtomRegistry.get(threadOutboxManager.queuedMessagesByThreadKeyAtom),
  );
  await Promise.all(
    queued.map((message) => {
      const moved = retargetQueuedCreation(message, from, to);
      if (moved === null) return Promise.resolve(false);
      return updateThreadOutboxMessage(
        withFirstTurnContext(moved, firstTurnContext),
        threadOutboxRevision(message.messageId),
      );
    }),
  );
}
