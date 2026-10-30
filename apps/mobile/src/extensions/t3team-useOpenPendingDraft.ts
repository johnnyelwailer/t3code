import { EnvironmentId, ProjectId } from "@t3tools/contracts";

import { useSelectWorkspaceDetail } from "../features/workspace/useSelectWorkspaceDetail";
import { createNewTaskDraft, waitForComposerDraftsLoaded } from "../state/use-composer-drafts";
import type { PendingDraftProject } from "./t3team-pendingDraftTypes";

/**
 * Creates an empty new-task draft for a project that is not in the catalog yet and opens it the way
 * the Chats list opens a draft row. `onCreated` runs with the draft key after the draft exists and
 * before it opens, so the distribution can register the key in its `usePendingDrafts` map first
 * (a draft that is in neither the catalog nor that map returns to the project picker). Resolves
 * with the draft key. An empty draft lives in memory only: it does not survive an app restart.
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
