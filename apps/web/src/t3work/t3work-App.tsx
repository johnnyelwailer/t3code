import { useState } from "react";
import type { ProjectShellProject } from "@t3tools/project-context";
import { Sidebar, SidebarInset, SidebarProvider } from "~/t3work/components/ui/t3work-sidebar";
import { ProjectSidebar } from "~/t3work/components/t3work-ProjectSidebar";
import { useProjectStore } from "~/t3work/hooks/t3work-useProjectStore";
import type { ViewState } from "~/t3work/t3work-types";
import { CreateProjectDialog } from "~/t3work/t3work-CreateProjectDialog";
import { ManageProjectRepositoriesDialog } from "~/t3work/t3work-ManageProjectRepositoriesDialog";
import { AppMainContent } from "~/t3work/t3work-AppMainContent";
import { ProjectDashboard } from "~/t3work/t3work-ProjectDashboard";
import { TicketDetailView } from "~/t3work/t3work-TicketDetailView";
import { useAppHandlers } from "~/t3work/t3work-useAppHandlers";

type AppProps = {
  view?: ViewState | null;
  showCreate?: boolean;
  onCreateOpenChange?: (open: boolean) => void;
  onOpenHome?: () => void;
  onOpenSettings?: () => void;
  onOpenDashboard?: (projectId: string) => void;
  onOpenTicket?: (projectId: string, ticketId: string) => void;
  onOpenThread?: (projectId: string, threadId: string) => void;
  onProjectCreated?: (project: ProjectShellProject) => void;
};

export function App({
  view,
  showCreate: showCreateProp,
  onCreateOpenChange,
  onOpenHome,
  onOpenSettings,
  onOpenDashboard,
  onOpenTicket,
  onOpenThread,
  onProjectCreated,
}: AppProps = {}) {
  const store = useProjectStore();
  const [showCreateInternal, setShowCreateInternal] = useState(false);
  const [manageRepositoriesProjectId, setManageRepositoriesProjectId] = useState<string | null>(
    null,
  );

  const showCreate = showCreateProp ?? showCreateInternal;
  const setShowCreate = onCreateOpenChange ?? setShowCreateInternal;
  const activeView = view ?? store.view;
  const selectedProjectId = activeView?.projectId ?? store.selectedProjectId;
  const manageRepositoriesProject = manageRepositoriesProjectId
    ? (store.projects.find((candidate) => candidate.id === manageRepositoriesProjectId) ?? null)
    : null;
  const {
    handleSelectProject,
    handleSelectTicket,
    handleSelectThread,
    handleCreateThread,
    handleCreateTicketKickoffThread,
    handleCreateTicketThreadFromSidebar,
    handleThreadKickoffConsumed,
    handleDeleteProject,
    handleDeleteThread,
  } = useAppHandlers({
    store,
    activeView,
    onOpenHome,
    onOpenDashboard,
    onOpenTicket,
    onOpenThread,
  });

  return (
    <SidebarProvider className="h-dvh! min-h-0!" defaultOpen>
      <Sidebar
        side="left"
        collapsible="none"
        className="border-r border-border bg-card text-foreground"
      >
        <ProjectSidebar
          projects={store.projects}
          selectedId={selectedProjectId}
          expandedIds={store.expandedProjectIds}
          threads={store.threads}
          getThreadsForProject={store.getThreadsForProject}
          view={activeView}
          projectSortOrder={store.projectSortOrder}
          threadSortOrder={store.threadSortOrder}
          threadPreviewCount={store.threadPreviewCount}
          onSelectProject={handleSelectProject}
          onSelectTicket={handleSelectTicket}
          onSelectThread={handleSelectThread}
          onToggleExpand={store.toggleProjectExpanded}
          onCreateProject={() => setShowCreate(true)}
          onOpenSettings={onOpenSettings}
          onManageProjectRepositories={setManageRepositoriesProjectId}
          onDeleteProject={handleDeleteProject}
          onRenameProject={store.renameProject}
          onCreateThread={handleCreateThread}
          onCreateTicketThread={handleCreateTicketThreadFromSidebar}
          onDeleteThread={handleDeleteThread}
          onRenameThread={store.renameThread}
          onProjectSortOrderChange={store.setProjectSortOrder}
          onThreadSortOrderChange={store.setThreadSortOrder}
          onThreadPreviewCountChange={store.setThreadPreviewCount}
        />
      </Sidebar>

      <SidebarInset className="h-dvh min-h-0 overflow-hidden bg-background text-foreground">
        <AppMainContent
          view={activeView}
          projects={store.projects}
          getThreadsForProject={store.getThreadsForProject}
          onOpenTicket={handleSelectTicket}
          onOpenThread={handleSelectThread}
          onKickoffTicketThread={handleCreateTicketKickoffThread}
          onThreadKickoffConsumed={handleThreadKickoffConsumed}
          onBackToDashboard={handleSelectProject}
          onCreate={() => setShowCreate(true)}
          renderDashboard={(project) => (
            <ProjectDashboard
              project={project}
              tickets={[]}
              onOpenTicket={handleSelectTicket}
              onManageRepositories={setManageRepositoriesProjectId}
            />
          )}
          renderTicketDetail={(project, ticketId) => (
            <TicketDetailView
              project={project}
              ticketId={ticketId}
              projectThreads={store.getThreadsForProject(project.id)}
              onOpenTicket={handleSelectTicket}
              onOpenThread={handleSelectThread}
              onKickoffThread={handleCreateTicketKickoffThread}
              onBack={() => handleSelectProject(project.id)}
            />
          )}
        />
      </SidebarInset>

      {showCreate && (
        <CreateProjectDialog
          onClose={() => setShowCreate(false)}
          onCreated={(project) => {
            store.addProject(project);
            onProjectCreated?.(project);
            if (!onProjectCreated) {
              setShowCreate(false);
            }
          }}
        />
      )}

      {manageRepositoriesProject ? (
        <ManageProjectRepositoriesDialog
          project={manageRepositoriesProject}
          onClose={() => setManageRepositoriesProjectId(null)}
          onProjectUpdated={(nextProject) => store.updateProject(nextProject.id, nextProject)}
        />
      ) : null}
    </SidebarProvider>
  );
}
