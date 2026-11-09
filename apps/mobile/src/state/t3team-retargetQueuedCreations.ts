import type { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";

import { appAtomRegistry } from "./atom-registry";
import { type FirstTurnContext, withFirstTurnContext } from "./t3team-firstTurnContext";
import { followRetargetedThreads } from "./t3team-followRetargetedThreads";
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
  /** Threads moved from `from` by this or an earlier unfinished call, now with nothing left there. */
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

// Calls for one placeholder run one after another, so none writes a copy another already moved.
const lanes = new Map<EnvironmentId, Promise<QueuedRetargetResult>>();
// Threads touched per placeholder, followed by every call until one completes.
const touchedThreads = new Map<EnvironmentId, Set<ThreadId>>();
// Loaded lazily: the module reaches the connection runtime, which an overlay import would cycle.
let outboxHooks: Promise<typeof import("./use-thread-outbox")> | null = null;

/**
 * Moves everything queued on a pending draft's placeholder environment (`from`, unique to the
 * draft, never connectable) onto `to`, with `firstTurnContext` on each creation, then makes the
 * moved threads' open routes and composer drafts follow. Never touches a message being dispatched
 * and never rejects; complete only when nothing is left on `from`.
 */
export function retargetQueuedCreations(
  from: QueuedCreationTarget,
  to: QueuedCreationTarget,
  firstTurnContext?: FirstTurnContext,
): Promise<QueuedRetargetResult> {
  const previous = lanes.get(from.environmentId) ?? Promise.resolve(null);
  const run = previous.then(() => moveAndFollow(from, to, firstTurnContext));
  lanes.set(from.environmentId, run);
  void run.then(() => {
    if (lanes.get(from.environmentId) === run) lanes.delete(from.environmentId);
  });
  return run;
}

async function moveAndFollow(
  from: QueuedCreationTarget,
  to: QueuedCreationTarget,
  firstTurnContext: FirstTurnContext | undefined,
): Promise<QueuedRetargetResult> {
  const touched = touchedThreads.get(from.environmentId) ?? new Set<ThreadId>();
  touchedThreads.set(from.environmentId, touched);
  let loaded = false;
  try {
    loaded = await threadOutboxManager.load();
    if (loaded) await moveQueued(from, to, firstTurnContext, touched);
  } catch (error) {
    console.warn("[thread-outbox] could not move the tasks queued on a pending draft", error);
  }
  const left = queuedOn(from);
  const leftThreads = new Set(left.map((message) => message.threadId));
  const movedThreadIds = [...touched].filter((threadId) => !leftThreads.has(threadId));
  try {
    await followRetargetedThreads(from.environmentId, to.environmentId, movedThreadIds);
  } catch (error) {
    console.warn("[thread-outbox] could not follow the moved threads", error);
  }
  const complete = loaded && left.length === 0;
  if (complete) touchedThreads.delete(from.environmentId);
  return { complete, movedThreadIds };
}

async function moveQueued(
  from: QueuedCreationTarget,
  to: QueuedCreationTarget,
  firstTurnContext: FirstTurnContext | undefined,
  touched: Set<ThreadId>,
): Promise<void> {
  const { dispatchingQueuedMessageIdAtom } = await (outboxHooks ??= import("./use-thread-outbox"));
  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    // Revisions belong to the snapshot: a message changed since is not overwritten.
    const queued = queuedOn(from).map((message) => ({
      message,
      revision: threadOutboxRevision(message.messageId),
    }));
    if (queued.length === 0) return;
    // A thread whose message could not move keeps its later messages for the next pass.
    const blocked = new Set<ThreadId>();
    for (const { message, revision } of queued) {
      touched.add(message.threadId);
      if (blocked.has(message.threadId)) continue;
      const moved =
        message.creation === undefined
          ? { ...message, environmentId: to.environmentId }
          : withFirstTurnContext(retargetQueuedCreation(message, from, to)!, firstTurnContext);
      if (
        message.messageId === appAtomRegistry.get(dispatchingQueuedMessageIdAtom) ||
        !(await updateThreadOutboxMessage(moved, revision))
      ) {
        blocked.add(message.threadId);
      }
    }
  }
}
