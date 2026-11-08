import { EnvironmentId, ProjectId } from "@t3tools/contracts";

import { useSelectWorkspaceDetail } from "../features/workspace/useSelectWorkspaceDetail";
import { createNewTaskDraft, waitForComposerDraftsLoaded } from "../state/use-composer-drafts";
import { openPendingDraft } from "./t3team-openPendingDraft";
import type { PendingDraftProject } from "./t3team-pendingDraftTypes";

/**
 * Creates an empty draft for a project that is not in the catalog yet and opens it. `onCreated` runs
 * with the draft key before the draft opens, so register the key in `usePendingDrafts` first or the
 * draft returns to the project picker. The empty draft is in memory only.
 */
export function useOpenPendingDraft() {
  const selectDetail = useSelectWorkspaceDetail();
  return (project: PendingDraftProject, onCreated?: (draftKey: string) => void) =>
    openPendingDraft(
      {
        waitForDrafts: waitForComposerDraftsLoaded,
        createDraft: (target) =>
          createNewTaskDraft({
            environmentId: EnvironmentId.make(target.environmentId),
            projectId: ProjectId.make(target.id),
          }),
        openDraft: (draftKey, target) =>
          selectDetail({
            name: "Thread",
            params: {
              draft: {
                environmentId: target.environmentId,
                projectId: target.id,
                title: target.title,
                draftId: draftKey,
              },
            },
          }),
      },
      project,
      onCreated,
    );
}
