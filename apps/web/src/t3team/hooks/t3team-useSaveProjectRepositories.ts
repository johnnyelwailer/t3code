import { useState } from "react";
import type { ProjectShellProject } from "@t3tools/project-context";

import { useBackend } from "~/t3team/backend/t3team-index";
import type { LinkedRepositorySyncResult } from "~/t3team/backend/t3team-types";
import { saveProjectRepositories } from "~/t3team/hooks/t3team-saveProjectRepositories";
import { useLinkedRepositorySyncView } from "~/t3team/hooks/t3team-useLinkedRepositorySyncView";

/**
 * The linked-repositories dialog's save: its progress view, whether it is running, its error, and
 * what was last saved. Saving returns before a clone finishes; the dialog stays open to show it.
 */
export function useSaveProjectRepositories(input: {
  readonly project: ProjectShellProject;
  readonly linkedRepositoryUrls: ReadonlyArray<string>;
  readonly linkedRepositoryBranches: Parameters<
    typeof saveProjectRepositories
  >[0]["linkedRepositoryBranches"];
  readonly mainRepositoryUrl: string | null;
  /** The main repository this save switches to; `undefined` when unchanged. */
  readonly mainChange: string | null | undefined;
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
    main: string | null;
  } | null>(null);
  const { linkedRepositoryUrls, mainChange, syncStatus } = input;
  const syncView = useLinkedRepositorySyncView({
    urls: linkedRepositoryUrls,
    byUrl: syncStatus.byUrl,
    mainRepositoryUrl: mainChange,
  });

  const save = async () => {
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
        // Show clone progress while the save waits on the chosen main repository's clone.
        onSaved: () => syncStatus.refresh(),
        onPhase: syncView.setPhase,
        ...(mainChange !== undefined ? { mainRepositoryUrl: mainChange } : {}),
      });
      input.onProjectUpdated(nextProject);
      setSaved({ urls: linkedRepositoryUrls, main: input.mainRepositoryUrl });
      syncStatus.refresh();
    } catch (error) {
      setSaveError(error);
      syncView.hide();
    } finally {
      setSaving(false);
    }
  };

  const unchangedSinceSave =
    saved !== null && saved.urls === linkedRepositoryUrls && saved.main === input.mainRepositoryUrl;
  return { save, saving, saved, saveError, syncView, unchangedSinceSave };
}
