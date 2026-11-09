import { EnvironmentId, ProjectId } from "@t3tools/contracts";

import { followRetargetedThreads } from "../state/t3team-followRetargetedThreads";
import { retargetQueuedCreations } from "../state/t3team-retargetQueuedCreations";
import { retargetNewTaskDraft } from "../state/use-composer-drafts";
import type { PendingDraft } from "./t3team-pendingDraftTypes";

export interface PendingDraftRetargetResult {
  /** False: the queue could not be read or a task could not move yet. Call again; it is idempotent. */
  readonly complete: boolean;
}

/**
 * Restamps a draft onto the real project, as the picker does. Call it once the catalog lists that
 * project, then drop the draft's map entry. With `pending` (the entry on its placeholder), tasks
 * queued on the placeholder move first (with `firstTurnContext`), and their open threads follow;
 * the draft is restamped only when they all moved.
 */
export async function retargetPendingDraft(
  draftKey: string,
  project: { readonly environmentId: string; readonly projectId: string },
  pending?: Pick<PendingDraft, "project" | "firstTurnContext">,
): Promise<PendingDraftRetargetResult> {
  const to = {
    environmentId: EnvironmentId.make(project.environmentId),
    projectId: ProjectId.make(project.projectId),
  };
  if (pending !== undefined) {
    const from = {
      environmentId: EnvironmentId.make(pending.project.environmentId),
      projectId: ProjectId.make(pending.project.id),
    };
    const moved = await retargetQueuedCreations(from, to, pending.firstTurnContext);
    await followRetargetedThreads(from.environmentId, to.environmentId, moved.movedThreadIds);
    if (!moved.complete) return { complete: false };
  }
  retargetNewTaskDraft(draftKey, to);
  return { complete: true };
}
