import type { ProjectShellProject } from "@t3tools/project-context";

import { T3TeamCommandPalette } from "~/t3team/components/t3team-CommandPalette";
import { ManageProjectRepositoriesDialog } from "~/t3team/t3team-ManageProjectRepositoriesDialog";
import type { ProjectTicket, ProjectThread, ThreadSortOrder } from "~/t3team/t3team-types";

type AppOverlaysProps = {
  setShowCreate: (open: boolean) => void;
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
  setShowCreate,
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
  return (
    <>
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
