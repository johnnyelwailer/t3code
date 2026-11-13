import { useState } from "react";
import type { ProjectShellProject } from "@t3tools/project-context";

import { useBackend } from "~/t3team/backend/t3team-index";
import type { LinkedRepositorySyncResult } from "~/t3team/backend/t3team-types";
import { saveProjectRepositories } from "~/t3team/hooks/t3team-saveProjectRepositories";
import { useLinkedRepositorySyncView } from "~/t3team/hooks/t3team-useLinkedRepositorySyncView";

/**
 * The linked-repositories dialog's save for the linked list (and branches). The main
 * repository is persisted on its own by Make main, not through this save.
 */
export function useSaveProjectRepositories(input: {
  readonly project: ProjectShellProject;
  readonly linkedRepositoryUrls: ReadonlyArray<string>;
  readonly linkedRepositoryBranches: Parameters<
    typeof saveProjectRepositories
  >[0]["linkedRepositoryBranches"];
  readonly syncStatus: {
    readonly byUrl: ReadonlyMap<string, LinkedRepositorySyncResult>;
    readonly refresh: () => void;
  };
  readonly onProjectUpdated: (project: ProjectShellProject) => void;
}) {
  const backend = useBackend();
  const [saveError, setSaveError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{
    urls: ReadonlyArray<string>;
  } | null>(null);
  const { linkedRepositoryUrls, syncStatus } = input;
  const syncView = useLinkedRepositorySyncView({
    urls: linkedRepositoryUrls,
    byUrl: syncStatus.byUrl,
    mainRepositoryUrl: undefined,
  });

  const save = async (): Promise<ProjectShellProject | null> => {
    setSaveError(null);
    setSaving(true);
    syncView.begin();
    try {
      const nextProject = await saveProjectRepositories({
        backend,
        project: input.project,
        linkedRepositoryUrls,
        ...(input.linkedRepositoryBranches
          ? { linkedRepositoryBranches: input.linkedRepositoryBranches }
          : {}),
        onSaved: () => syncStatus.refresh(),
        onPhase: syncView.setPhase,
      });
      input.onProjectUpdated(nextProject);
      setSaved({ urls: linkedRepositoryUrls });
      syncStatus.refresh();
      return nextProject;
    } catch (error) {
      setSaveError(error);
      syncView.hide();
      return null;
    } finally {
      setSaving(false);
    }
  };

  const unchangedSinceSave = saved !== null && saved.urls === linkedRepositoryUrls;
  return { save, saving, saved, saveError, syncView, unchangedSinceSave };
}
