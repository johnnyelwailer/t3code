import { useCallback, useEffect, useState } from "react";
import type { ProjectShellProject, ProjectSource, ProjectSourceKind } from "@t3tools/project-context";

import { randomUUID } from "~/lib/utils";
import { isDuplicateProjectBindingError } from "~/t3team/chat/t3team-duplicateThreadCreateError";
import { toSourceBindingCommand } from "~/t3team/t3team-projectSourceBinding";
import { useBackend } from "~/t3team/backend/t3team-index";
import { useCreateProject } from "./t3team-useCreateProject";

/**
 * Controller for the repair/rebind flow (Defect 1: a project whose Jira binding drifted or was
 * never persisted). Reuses {@link useCreateProject}'s account/project picker (loadPersistedAccounts,
 * loadProjects, account+project selection state) rather than a second Atlassian picker, and
 * pre-selects the account/project the stored entry already points at, when they still exist.
 *
 * Nothing is dispatched until the caller invokes `confirmRepair` — the user always explicitly
 * confirms the rebind, even when it is fully pre-filled.
 */
export function useRepairProjectBinding(project: ProjectShellProject) {
  const backend = useBackend();
  const setup = useCreateProject();
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const storedAccountId = project.source.accountId;
  const storedExternalProjectId = project.source.externalProjectId;

  useEffect(() => {
    void setup.loadPersistedAccounts();
    // Only ever needs to run once, when the repair dialog mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pre-select the account the stored entry already points at, once accounts load.
  useEffect(() => {
    if (setup.selectedAccount || setup.accounts.length === 0) return;
    const match = setup.accounts.find((account) => account.id === storedAccountId);
    if (!match) return;
    setup.setSelectedAccount(match);
    void setup.loadProjects(match);
  }, [setup.accounts, setup.selectedAccount, setup, storedAccountId]);

  // Pre-select the external project the stored entry already points at, once projects load.
  useEffect(() => {
    if (setup.selectedProject || setup.projects.length === 0) return;
    const match = setup.projects.find((candidate) => candidate.id === storedExternalProjectId);
    if (match) setup.setSelectedProject(match);
  }, [setup.projects, setup.selectedProject, setup, storedExternalProjectId]);

  const confirmRepair = useCallback(async (): Promise<ProjectShellProject | null> => {
    if (!backend || !setup.selectedAccount || !setup.selectedProject) return null;
    setConfirming(true);
    setConfirmError(null);
    try {
      const nextSource: ProjectSource = {
        provider: setup.selectedProject.provider as ProjectSourceKind,
        accountId: setup.selectedAccount.id,
        externalProjectId: setup.selectedProject.id,
        ...(setup.selectedProject.key ? { externalProjectKey: setup.selectedProject.key } : {}),
        ...(setup.selectedProject.url ? { externalProjectUrl: setup.selectedProject.url } : {}),
        ...(project.source.raw !== undefined ? { raw: project.source.raw } : {}),
      };
      await backend.dispatchCommand({
        type: "project.meta.update",
        commandId: randomUUID() as any,
        projectId: project.id as any,
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
  }, [backend, project, setup.selectedAccount, setup.selectedProject]);

  return { ...setup, confirming, confirmError, confirmRepair };
}
