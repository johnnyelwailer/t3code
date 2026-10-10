import { useCallback, useState } from "react";
import { ProjectId } from "@t3tools/contracts";
import type {
  ProjectShellProject,
  ProjectSource,
  ProjectSourceKind,
} from "@t3tools/project-context";

import { isDuplicateProjectBindingError } from "~/t3team/chat/t3team-duplicateThreadCreateError";
import { toSourceBindingCommand } from "~/t3team/t3team-projectSourceBinding";
import { useBackend } from "~/t3team/backend/t3team-index";
import { resolveJiraExternalProject } from "./t3team-createJiraProject";
import { jiraCatalogEntryKey } from "./t3team-jiraProjectCatalog.logic";
import { useJiraProjectCatalogState } from "./t3team-useJiraProjectCatalogState";

/**
 * Controller for the repair/rebind flow (Defect 1: a project whose Jira binding drifted or was
 * never persisted). Uses the same Jira catalog as the add-project dialog — every project on every
 * connected site, the site implied by the project — and pre-selects the project the stored entry
 * already points at, when it still exists.
 *
 * Nothing is dispatched until the caller invokes `confirmRepair` — the user always explicitly
 * confirms the rebind, even when it is fully pre-filled.
 */
export function useRepairProjectBinding(project: ProjectShellProject) {
  const backend = useBackend();
  const catalogState = useJiraProjectCatalogState();
  const [chosenKey, setChosenKey] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const { accountId, externalProjectId } = project.source;
  const storedKey =
    accountId && externalProjectId ? jiraCatalogEntryKey(accountId, externalProjectId) : null;
  const storedEntry = catalogState.catalog.find((entry) => entry.entryKey === storedKey);
  const selectedKey = chosenKey ?? storedEntry?.entryKey ?? null;
  const selected = catalogState.catalog.find((entry) => entry.entryKey === selectedKey) ?? null;

  const confirmRepair = useCallback(async (): Promise<ProjectShellProject | null> => {
    if (!backend || !selected) return null;
    setConfirming(true);
    setConfirmError(null);
    try {
      const external = await resolveJiraExternalProject(backend, selected);
      const nextSource: ProjectSource = {
        provider: external.provider as ProjectSourceKind,
        accountId: selected.accountId,
        externalProjectId: external.id,
        ...(external.key ? { externalProjectKey: external.key } : {}),
        ...(external.url ? { externalProjectUrl: external.url } : {}),
        ...(project.source.raw !== undefined ? { raw: project.source.raw } : {}),
      };
      await backend.orchestration.updateProjectSource({
        projectId: ProjectId.make(project.id),
        source: toSourceBindingCommand(nextSource),
      });
      return { ...project, source: nextSource };
    } catch (error) {
      setConfirmError(
        isDuplicateProjectBindingError(error)
          ? "That Jira project is already bound to another project in this workspace."
          : error instanceof Error
            ? error.message
            : "Failed to repair the project binding.",
      );
      return null;
    } finally {
      setConfirming(false);
    }
  }, [backend, project, selected]);

  return {
    catalogState,
    selectedKey,
    selected,
    select: setChosenKey,
    confirming,
    confirmError,
    confirmRepair,
  };
}
