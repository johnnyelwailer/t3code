import { useEffect } from "react";

import type { ProjectShellProject } from "@t3tools/project-context";

import { T3TeamCommandPalette } from "~/t3team/components/t3team-CommandPalette";
import { ManageProjectRepositoriesDialog } from "~/t3team/t3team-ManageProjectRepositoriesDialog";
import { CreateProjectDialog } from "~/t3team/t3team-CreateProjectDialog";
import { useT3TeamCreateProjectRequestStore } from "~/t3team/t3team-createProjectRequest";
import type { ProjectTicket, ProjectThread, ThreadSortOrder } from "~/t3team/t3team-types";

type AppOverlaysProps = {
  showCreate: boolean;
  setShowCreate: (open: boolean) => void;
  onProjectCreated?: (project: ProjectShellProject) => void;
  addProject: (project: ProjectShellProject) => void;
  projects: ReadonlyArray<ProjectShellProject>;
  threads: ReadonlyArray<ProjectThread>;
  threadSortOrder: ThreadSortOrder;
  getTicketsForProject: (projectId: string) => ReadonlyArray<ProjectTicket>;
  onSelectProject: (projectId: string) => void;
  onSelectTicket: (projectId: string, ticketId: string) => void;
  onSelectThread: (projectId: string, threadId: string) => void;
  onOpenSettings?: () => void;
  showSearchPalette: boolean;
  setShowSearchPalette: (open: boolean) => void;
  manageRepositoriesProject: ProjectShellProject | null;
  setManageRepositoriesProjectId: (projectId: string | null) => void;
  updateProject: (projectId: string, project: ProjectShellProject) => void;
};

export function AppOverlays({
  showCreate,
  setShowCreate,
  onProjectCreated,
  addProject,
  projects,
  threads,
  threadSortOrder,
  getTicketsForProject,
  onSelectProject,
  onSelectTicket,
  onSelectThread,
  onOpenSettings,
  showSearchPalette,
  setShowSearchPalette,
  manageRepositoriesProject,
  setManageRepositoriesProjectId,
  updateProject,
}: AppOverlaysProps) {
  // The Add-project palette cannot reach `showCreate`, so it raises a request instead
  // ({@link ./t3team-createProjectRequest.ts}). Honour it here, where the wizard already lives.
  const createProjectRequestId = useT3TeamCreateProjectRequestStore((state) => state.requestId);
  const clearCreateProjectRequest = useT3TeamCreateProjectRequestStore((state) => state.clear);
  useEffect(() => {
    if (createProjectRequestId === 0) return;
    clearCreateProjectRequest();
    setShowCreate(true);
  }, [clearCreateProjectRequest, createProjectRequestId, setShowCreate]);

  return (
    <>
      {showCreate ? (
        <CreateProjectDialog
          onClose={() => setShowCreate(false)}
          onCreated={(project) => {
            addProject(project);
            onProjectCreated?.(project);
            if (!onProjectCreated) {
              setShowCreate(false);
            }
          }}
        />
      ) : null}

      <T3TeamCommandPalette
        open={showSearchPalette}
        onOpenChange={setShowSearchPalette}
        projects={projects}
        threads={threads}
        threadSortOrder={threadSortOrder}
        getTicketsForProject={getTicketsForProject}
        onSelectProject={onSelectProject}
        onSelectTicket={onSelectTicket}
        onSelectThread={onSelectThread}
        onOpenSettings={onOpenSettings}
        onOpenCreateProject={() => setShowCreate(true)}
      />

      {manageRepositoriesProject ? (
        <ManageProjectRepositoriesDialog
          project={manageRepositoriesProject}
          onClose={() => setManageRepositoriesProjectId(null)}
          onProjectUpdated={(nextProject) => updateProject(nextProject.id, nextProject)}
        />
      ) : null}
    </>
  );
}
