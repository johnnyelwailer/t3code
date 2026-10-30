import { EnvironmentId, ProjectId } from "@t3tools/contracts";

import { useSelectWorkspaceDetail } from "../features/workspace/useSelectWorkspaceDetail";
import { createNewTaskDraft, waitForComposerDraftsLoaded } from "../state/use-composer-drafts";
import type { PendingDraftProject } from "./t3team-pendingDraftTypes";

/**
 * Creates an empty draft for a project that is not in the catalog yet and opens it. `onCreated` runs
 * with the draft key before the draft opens, so register the key in `usePendingDrafts` first or the
 * draft returns to the project picker. The empty draft is in memory only.
 */
export function useOpenPendingDraft() {
  const selectDetail = useSelectWorkspaceDetail();
  return async (
    project: PendingDraftProject,
    onCreated?: (draftKey: string) => void,
  ): Promise<string> => {
    await waitForComposerDraftsLoaded();
    const draftKey = createNewTaskDraft({
      environmentId: EnvironmentId.make(project.environmentId),
      projectId: ProjectId.make(project.id),
    });
    onCreated?.(draftKey);
    selectDetail({
      name: "Thread",
      params: {
        draft: {
          environmentId: project.environmentId,
          projectId: project.id,
          title: project.title,
          draftId: draftKey,
        },
      },
    });
    return draftKey;
  };
}
