import { useCallback } from "react";
import type { ProjectShellProject } from "@t3tools/project-context";
import type { EnvironmentId } from "@t3tools/contracts";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
  type AtomCommandResult,
} from "@t3tools/client-runtime/state/runtime";
import { useAtomCommand } from "~/state/use-atom-command";
import { projectEnvironment } from "~/state/projects";
import { toastManager } from "~/components/ui/toast";
import type { ViewState } from "~/t3work/t3work-types";
import type { useProjectStore } from "~/t3work/hooks/t3work-useProjectStore";

type ProjectStore = ReturnType<typeof useProjectStore>;
type CommandResult = AtomCommandResult<unknown, unknown>;

export function readLocalWorkspaceEnvironmentId(
  project: ProjectShellProject,
): EnvironmentId | null {
  if (project.source.provider !== "local") return null;
  const raw = project.source.raw;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const environmentId = (raw as Record<string, unknown>).environmentId;
  return typeof environmentId === "string" ? (environmentId as EnvironmentId) : null;
}

function reportCommandFailure(title: string, result: CommandResult) {
  if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
    const error = squashAtomCommandFailure(result);
    const description = error instanceof Error ? error.message : "Unknown error.";
    toastManager.add({ type: "error", title, description });
  }
}

export function useLocalWorkspaceCommands(input: {
  store: ProjectStore;
  activeView: ViewState | null;
  onOpenHome: (() => void) | undefined;
}) {
  const { store, activeView, onOpenHome } = input;
  const deleteProjectCommand = useAtomCommand(projectEnvironment.delete, { reportFailure: false });
  const updateProjectCommand = useAtomCommand(projectEnvironment.update, { reportFailure: false });

  const handleDeleteProject = useCallback(
    async (projectId: string) => {
      const project = store.allProjects.find((candidate) => candidate.id === projectId) ?? null;
      const environmentId = project ? readLocalWorkspaceEnvironmentId(project) : null;
      if (project && environmentId) {
        const result = await deleteProjectCommand({
          environmentId,
          input: {
            projectId: (project.source.externalProjectId ?? projectId) as never,
            force: true,
          },
        });
        if (result._tag === "Failure") {
          reportCommandFailure(`Failed to remove "${project.title}"`, result);
          if (!isAtomCommandInterrupted(result)) return;
        }
      }
      const deletedWasActive = activeView?.projectId === projectId;
      store.deleteProject(projectId);
      if (deletedWasActive) onOpenHome?.();
    },
    [activeView, deleteProjectCommand, onOpenHome, store],
  );

  const handleRenameProject = useCallback(
    async (projectId: string, newTitle: string) => {
      const project = store.allProjects.find((candidate) => candidate.id === projectId) ?? null;
      const environmentId = project ? readLocalWorkspaceEnvironmentId(project) : null;
      if (project && environmentId) {
        const result = await updateProjectCommand({
          environmentId,
          input: {
            projectId: (project.source.externalProjectId ?? projectId) as never,
            title: newTitle as never,
          },
        });
        if (result._tag === "Failure") {
          reportCommandFailure(`Failed to rename "${project.title}"`, result);
        }
        return;
      }
      store.renameProject(projectId, newTitle);
    },
    [store, updateProjectCommand],
  );

  return { handleDeleteProject, handleRenameProject };
}
