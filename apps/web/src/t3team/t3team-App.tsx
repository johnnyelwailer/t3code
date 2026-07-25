import { useState } from "react";
import type { ProjectShellProject } from "@t3tools/project-context";
import { Sidebar, SidebarProvider, SidebarRail } from "~/t3team/components/ui/t3team-sidebar";
import { AppContentPane } from "~/t3team/t3team-AppContentPane";
import { ProjectSidebar } from "~/t3team/components/t3team-ProjectSidebar";
import { useProjectSidebarState } from "~/t3team/hooks/t3team-useProjectSidebarState";
import { useProjectStore } from "~/t3team/hooks/t3team-useProjectStore";
import type { ViewState } from "~/t3team/t3team-types";
import { AppOverlays } from "~/t3team/t3team-AppOverlays";
import { T3TeamLeftSidebarDesktopToggle } from "~/t3team/t3team-LeftSidebarDesktopToggle";
import type { ProjectDashboardMode } from "~/t3team/t3team-projectDashboardModeState";
import { useAppHandlers } from "~/t3team/t3team-useAppHandlers";
import {
  useMergedRouteAndStoreView,
  useResolvedProjectView,
  useResolvedViewSync,
} from "~/t3team/t3team-useResolvedViewSync";
import { useHydratePinnedSidebarItems } from "~/t3team/hooks/t3team-useHydratePinnedSidebarItems";

type AppProps = {
  view?: ViewState | null;
  dashboardMode?: ProjectDashboardMode;
  showCreate?: boolean;
  reopenInitialSetup?: boolean;
  onCreateOpenChange?: (open: boolean) => void;
  onOpenHome?: () => void;
  onOpenSettings?: () => void;
  onOpenDashboard?: (
    projectId: string,
    dashboardMode?: ProjectDashboardMode,
    embeddedThreadId?: string | null,
  ) => void;
  onOpenTicket?: (projectId: string, ticketId: string, embeddedThreadId?: string | null) => void;
  onOpenThread?: (projectId: string, threadId: string) => void;
  onCloseEmbeddedThread?: () => void;
  onProjectCreated?: (project: ProjectShellProject) => void;
};

const T3TEAM_LEFT_SIDEBAR_WIDTH_STORAGE_KEY = "t3team_left_sidebar_width";
const T3TEAM_LEFT_SIDEBAR_MIN_WIDTH = 16 * 16;
const T3TEAM_MAIN_CONTENT_MIN_WIDTH = 44 * 16;

export function App({
  view,
  dashboardMode,
  showCreate: showCreateProp,
  reopenInitialSetup,
  onCreateOpenChange,
  onOpenHome,
  onOpenSettings,
  onOpenDashboard,
  onOpenTicket,
  onOpenThread,
  onCloseEmbeddedThread,
  onProjectCreated,
}: AppProps = {}) {
  const store = useProjectStore();
  useHydratePinnedSidebarItems();
  const { state: sidebarState, setState: setSidebarState } = useProjectSidebarState();
  const [showCreateInternal, setShowCreateInternal] = useState(false);
  const [showSearchPalette, setShowSearchPalette] = useState(false);
  const [manageRepositoriesProjectId, setManageRepositoriesProjectId] = useState<string | null>(
    null,
  );

  const showCreate = showCreateProp ?? showCreateInternal;
  const setShowCreate = onCreateOpenChange ?? setShowCreateInternal;
  const activeView = useMergedRouteAndStoreView(view, store.view);
  const resolvedView = useResolvedProjectView(store, activeView);
  const activeDashboardMode = dashboardMode ?? "my-work";
  const selectedProjectId = resolvedView?.projectId ?? store.selectedProjectId;
  const manageRepositoriesProject = manageRepositoriesProjectId
    ? (store.projects.find((candidate) => candidate.id === manageRepositoriesProjectId) ?? null)
    : null;
  const {
    handleSelectProject,
    handleSelectProjectDashboardMode,
    handleSelectTicket,
    handleSelectThread,
    handleOpenFullThread,
    handleOpenEmbeddedThread,
    handleCreateThread,
    handleCreateProjectKickoffThread,
    handleCreateTicketKickoffThread,
    handleCreateTicketThreadFromSidebar,
    handleThreadKickoffConsumed,
    handleDeleteProject,
    handleDeleteThread,
    handleRenameProject,
  } = useAppHandlers({
    store,
    activeView: resolvedView,
    onOpenHome,
    onOpenDashboard,
    onOpenTicket,
    onOpenThread,
  });
  useResolvedViewSync({
    activeDashboardMode,
    onOpenDashboard,
    onOpenThread,
    onOpenTicket,
    resolvedView,
    store,
    view,
  });

  return (
    <SidebarProvider className="h-dvh! min-h-0! overflow-hidden!" defaultOpen>
      <Sidebar
        side="left"
        collapsible="offcanvas"
        className="min-h-0 overflow-hidden border-r border-border bg-card text-foreground"
        resizable={{
          minWidth: T3TEAM_LEFT_SIDEBAR_MIN_WIDTH,
          shouldAcceptWidth: ({ nextWidth, wrapper }) =>
            wrapper.clientWidth - nextWidth >= T3TEAM_MAIN_CONTENT_MIN_WIDTH,
          storageKey: T3TEAM_LEFT_SIDEBAR_WIDTH_STORAGE_KEY,
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
            view={resolvedView}
            projectSortOrder={sidebarState.projectSortOrder}
            threadSortOrder={sidebarState.threadSortOrder}
            threadPreviewCount={sidebarState.threadPreviewCount}
            sidebarState={sidebarState}
            activeDashboardMode={activeDashboardMode}
            onSelectProject={handleSelectProject}
            onSelectProjectDashboardMode={handleSelectProjectDashboardMode}
            onSelectTicket={handleSelectTicket}
            onSelectThread={handleSelectThread}
            onToggleExpand={store.toggleProjectExpanded}
            onOpenSearch={() => setShowSearchPalette(true)}
            onCreateProject={() => setShowCreate(true)}
            onOpenSettings={onOpenSettings}
            onManageProjectRepositories={setManageRepositoriesProjectId}
            onDeleteProject={handleDeleteProject}
            onRenameProject={handleRenameProject}
            onCreateThread={handleCreateThread}
            onCreateTicketThread={handleCreateTicketThreadFromSidebar}
            onDeleteThread={handleDeleteThread}
            onRenameThread={store.renameThread}
            onProjectSortOrderChange={(projectSortOrder) => {
              setSidebarState((current) => ({ ...current, projectSortOrder }));
            }}
            onThreadSortOrderChange={(threadSortOrder) => {
              setSidebarState((current) => ({ ...current, threadSortOrder }));
            }}
            onThreadPreviewCountChange={(threadPreviewCount) => {
              setSidebarState((current) => ({ ...current, threadPreviewCount }));
            }}
            onSidebarStateChange={setSidebarState}
          />
        </div>
        <SidebarRail />
      </Sidebar>
      <T3TeamLeftSidebarDesktopToggle />

      <AppContentPane
        activeDashboardMode={activeDashboardMode}
        resolvedView={resolvedView}
        store={store}
        reopenInitialSetup={reopenInitialSetup ?? false}
        onCreate={() => setShowCreate(true)}
        onOpenTicket={handleSelectTicket}
        onOpenThread={handleSelectThread}
        onOpenFullThread={handleOpenFullThread}
        onOpenEmbeddedThread={handleOpenEmbeddedThread}
        {...(onCloseEmbeddedThread ? { onCloseEmbeddedThread } : {})}
        onKickoffProjectThread={handleCreateProjectKickoffThread}
        onKickoffTicketThread={handleCreateTicketKickoffThread}
        onThreadKickoffConsumed={handleThreadKickoffConsumed}
        onThreadDisplayModeChange={store.updateThreadDisplayMode}
        onBackToDashboard={handleSelectProject}
        onManageRepositories={setManageRepositoriesProjectId}
      />

      <AppOverlays
        showCreate={showCreate}
        setShowCreate={setShowCreate}
        addProject={store.addProject}
        projects={store.projects}
        threads={store.threads}
        threadSortOrder={sidebarState.threadSortOrder}
        getTicketsForProject={store.getTicketsForProject}
        onSelectProject={handleSelectProject}
        onSelectTicket={handleSelectTicket}
        onSelectThread={handleSelectThread}
        showSearchPalette={showSearchPalette}
        setShowSearchPalette={setShowSearchPalette}
        manageRepositoriesProject={manageRepositoriesProject}
        setManageRepositoriesProjectId={setManageRepositoriesProjectId}
        updateProject={store.updateProject}
        {...(onProjectCreated ? { onProjectCreated } : {})}
        {...(onOpenSettings ? { onOpenSettings } : {})}
      />
    </SidebarProvider>
  );
}
