import { EnvironmentId, ProjectId } from "@t3tools/contracts";

import { retargetNewTaskDraft } from "../state/use-composer-drafts";

/**
 * Restamps a draft onto the real project, as choosing it in the picker does, without leaving the
 * draft screen. Call it once the catalog lists that project, then drop the draft's map entry.
 */
export function retargetPendingDraft(
  draftKey: string,
  project: { readonly environmentId: string; readonly projectId: string },
): void {
  retargetNewTaskDraft(draftKey, {
    environmentId: EnvironmentId.make(project.environmentId),
    projectId: ProjectId.make(project.projectId),
  });
}
