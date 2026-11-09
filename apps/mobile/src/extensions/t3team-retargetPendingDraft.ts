import { EnvironmentId, ProjectId } from "@t3tools/contracts";

import { followRetargetedThreads } from "../state/t3team-followRetargetedThreads";
import {
  retargetQueuedCreations,
  type QueuedCreationTarget,
} from "../state/t3team-retargetQueuedCreations";
import { retargetNewTaskDraft } from "../state/use-composer-drafts";
import type { PendingDraft } from "./t3team-pendingDraftTypes";

export interface PendingDraftRetargetResult {
  /** False: the queue could not be read or a task could not move yet. Call again; it is idempotent. */
  readonly complete: boolean;
}

type Target = { readonly environmentId: string; readonly projectId: string };

const target = (project: Target): QueuedCreationTarget => ({
  environmentId: EnvironmentId.make(project.environmentId),
  projectId: ProjectId.make(project.projectId),
});

/**
 * Restamps a draft onto the real project, as the picker does; without `pending` synchronously, and
 * an invalid id throws. Call it once the catalog lists that project, then drop the draft's map
 * entry. With `pending` (the entry on its placeholder), see `moveQueuedThenRestamp`.
 */
export function retargetPendingDraft(
  draftKey: string,
  project: Target,
  pending?: Pick<PendingDraft, "project" | "firstTurnContext">,
): Promise<PendingDraftRetargetResult> {
  if (pending === undefined) {
    retargetNewTaskDraft(draftKey, target(project));
    return Promise.resolve({ complete: true });
  }
  return moveQueuedThenRestamp(draftKey, project, pending);
}

/**
 * Tasks queued on the placeholder move first (with `firstTurnContext`), the threads that moved
 * follow, and the draft is restamped only when nothing is left behind. Never rejects.
 */
async function moveQueuedThenRestamp(
  draftKey: string,
  project: Target,
  pending: Pick<PendingDraft, "project" | "firstTurnContext">,
): Promise<PendingDraftRetargetResult> {
  try {
    const to = target(project);
    const from = target({
      environmentId: pending.project.environmentId,
      projectId: pending.project.id,
    });
    const moved = await retargetQueuedCreations(from, to, pending.firstTurnContext);
    await followRetargetedThreads(from.environmentId, to.environmentId, moved.movedThreadIds);
    if (!moved.complete) return { complete: false };
    retargetNewTaskDraft(draftKey, to);
    return { complete: true };
  } catch (error) {
    console.warn("[pending-draft] could not retarget the draft's queued tasks", error);
    return { complete: false };
  }
}
