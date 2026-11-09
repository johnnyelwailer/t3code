import { EnvironmentId, ProjectId } from "@t3tools/contracts";

import { retargetQueuedCreations } from "../state/t3team-retargetQueuedCreations";
import { retargetNewTaskDraft } from "../state/use-composer-drafts";
import type { PendingDraft } from "./t3team-pendingDraftTypes";

/**
 * Restamps a draft onto the real project, as the picker does. Call it once the catalog lists that
 * project, then drop the draft's map entry. With `pending` (the entry on its placeholder), a task
 * queued on the placeholder moves too, with `firstTurnContext`, and is delivered once.
 */
export function retargetPendingDraft(
  draftKey: string,
  project: { readonly environmentId: string; readonly projectId: string },
  pending?: Pick<PendingDraft, "project" | "firstTurnContext">,
): Promise<void> {
  const to = {
    environmentId: EnvironmentId.make(project.environmentId),
    projectId: ProjectId.make(project.projectId),
  };
  retargetNewTaskDraft(draftKey, to);
  if (pending === undefined) return Promise.resolve();
  const from = {
    environmentId: EnvironmentId.make(pending.project.environmentId),
    projectId: ProjectId.make(pending.project.id),
  };
  return retargetQueuedCreations(from, to, pending.firstTurnContext);
}
