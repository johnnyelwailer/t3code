import { useState } from "react";
import type { ProjectShellProject } from "@t3tools/project-context";
import {
  Sidebar,
  SidebarInset,
  SidebarProvider,
  SidebarRail,
} from "~/t3work/components/ui/t3work-sidebar";
import { ProjectSidebar } from "~/t3work/components/t3work-ProjectSidebar";
import { useProjectStore } from "~/t3work/hooks/t3work-useProjectStore";
import type { ViewState } from "~/t3work/t3work-types";
import { CreateProjectDialog } from "~/t3work/t3work-CreateProjectDialog";
import { ManageProjectRepositoriesDialog } from "~/t3work/t3work-ManageProjectRepositoriesDialog";
import { AppMainContent } from "~/t3work/t3work-AppMainContent";
import { ProjectDashboard } from "~/t3work/t3work-ProjectDashboard";
import { TicketDetailView } from "~/t3work/t3work-TicketDetailView";
import { useAppHandlers } from "~/t3work/t3work-useAppHandlers";
import { T3workCommandPalette } from "~/t3work/components/t3work-CommandPalette";

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

const T3WORK_LEFT_SIDEBAR_WIDTH_STORAGE_KEY = "t3work_left_sidebar_width";
const T3WORK_LEFT_SIDEBAR_MIN_WIDTH = 16 * 16;
const T3WORK_MAIN_CONTENT_MIN_WIDTH = 44 * 16;

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
  const [showSearchPalette, setShowSearchPalette] = useState(false);
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
    handleCreateProjectKickoffThread,
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
    <SidebarProvider className="h-dvh! min-h-0! overflow-hidden!" defaultOpen>
      <Sidebar
        side="left"
        collapsible="offcanvas"
        className="min-h-0 overflow-hidden border-r border-border bg-card text-foreground"
        resizable={{
          minWidth: T3WORK_LEFT_SIDEBAR_MIN_WIDTH,
          shouldAcceptWidth: ({ nextWidth, wrapper }) =>
            wrapper.clientWidth - nextWidth >= T3WORK_MAIN_CONTENT_MIN_WIDTH,
          storageKey: T3WORK_LEFT_SIDEBAR_WIDTH_STORAGE_KEY,
        }}
      >
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <ProjectSidebar
            projects={store.projects}
            looseWorkspaceProjects={store.looseWorkspaceProjects}
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
            onOpenSearch={() => setShowSearchPalette(true)}
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
        </div>
        <SidebarRail />
      </Sidebar>

      <SidebarInset className="h-full min-h-0 overflow-hidden bg-background text-foreground">
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <AppMainContent
            view={activeView}
            projects={store.projects}
            allProjects={store.allProjects}
            getThreadsForProject={store.getThreadsForProject}
            onOpenThread={handleSelectThread}
            onKickoffProjectThread={handleCreateProjectKickoffThread}
            onThreadKickoffConsumed={handleThreadKickoffConsumed}
            onBackToDashboard={handleSelectProject}
            onCreate={() => setShowCreate(true)}
            onInlineProjectCreated={(project) => {
              store.addProject(project);
              onProjectCreated?.(project);
              handleSelectProject(project.id);
            }}
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
        </div>
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

      <T3workCommandPalette
        open={showSearchPalette}
        onOpenChange={setShowSearchPalette}
        projects={store.projects}
        threads={store.threads}
        threadSortOrder={store.threadSortOrder}
        getTicketsForProject={store.getTicketsForProject}
        onSelectProject={handleSelectProject}
        onSelectTicket={handleSelectTicket}
        onSelectThread={handleSelectThread}
        onOpenSettings={onOpenSettings}
        onOpenCreateProject={() => setShowCreate(true)}
      />

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
