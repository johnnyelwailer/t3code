import { useMemo, useState } from "react";
import { Sidebar, SidebarProvider, SidebarRail } from "~/t3team/components/ui/t3team-sidebar";
import { AppContentPane } from "~/t3team/t3team-AppContentPane";
import { AppSidebarLens } from "~/t3team/components/t3team-AppSidebarLens";
import { useProjectSidebarState } from "~/t3team/hooks/t3team-useProjectSidebarState";
import { useT3TeamMacosTitlebarInsetStyle } from "~/t3team/hooks/t3team-useMacosTitlebarInset";
import { useProjectStore } from "~/t3team/hooks/t3team-useProjectStore";
import { readProjectIdFromView } from "~/t3team/t3team-types";
import { resolveViewStoredProject } from "~/t3team/t3team-appMainContentResolution";
import { AppOverlays } from "~/t3team/t3team-AppOverlays";
import { T3TeamLeftSidebarDesktopToggle } from "~/t3team/t3team-LeftSidebarDesktopToggle";
import { useLocalProviderSessionThreadFilter } from "~/t3team/hooks/t3team-useLocalProviderSessionThreadFilter";
import { useAppHandlers } from "~/t3team/t3team-useAppHandlers";
import { useResolvedViewSync } from "~/t3team/t3team-useResolvedViewSync";
import { useHydratePinnedSidebarItems } from "~/t3team/hooks/t3team-useHydratePinnedSidebarItems";
import {
  T3TEAM_LEFT_SIDEBAR_MIN_WIDTH,
  T3TEAM_LEFT_SIDEBAR_WIDTH_STORAGE_KEY,
  T3TEAM_MAIN_CONTENT_MIN_WIDTH,
  type AppProps,
} from "~/t3team/t3team-AppProps";

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
  const macosTitlebarInsetStyle = useT3TeamMacosTitlebarInsetStyle();
  useHydratePinnedSidebarItems();
  const { state: sidebarState, setState: setSidebarState } = useProjectSidebarState();
  const [showCreateInternal, setShowCreateInternal] = useState(false);
  const [showSearchPalette, setShowSearchPalette] = useState(false);
  const [manageRepositoriesProjectId, setManageRepositoriesProjectId] = useState<string | null>(
    null,
  );

  const showCreate = showCreateProp ?? showCreateInternal;
  const setShowCreate = onCreateOpenChange ?? setShowCreateInternal;
  const activeView = view ?? store.view;
  const resolvedView = useMemo(
    () => resolveViewStoredProject(activeView, store.resolveProjectId),
    [activeView, store.resolveProjectId],
  );
  const activeDashboardMode = dashboardMode ?? "my-work";
  const selectedProjectId = readProjectIdFromView(resolvedView ?? null) ?? store.selectedProjectId;
  const manageRepositoriesProject = manageRepositoriesProjectId
    ? (store.projects.find((candidate) => candidate.id === manageRepositoriesProjectId) ?? null)
    : null;
  // "Local provider sessions" display filter: OFF hides already-adopted sessions from the
  // shell's thread lists; ON brings them back (see the hook docs). Selection/resolution
  // keep the full store.
  const { filter: filterVisibleThreads, filterForProject: getVisibleThreadsForProject } =
    useLocalProviderSessionThreadFilter(store.getThreadsForProject);
  const visibleThreads = useMemo(
    () => filterVisibleThreads(store.threads),
    [filterVisibleThreads, store.threads],
  );
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
    <SidebarProvider
      className="h-dvh! min-h-0! overflow-hidden!"
      defaultOpen
      style={macosTitlebarInsetStyle}
    >
      <Sidebar
        side="left"
        collapsible="offcanvas"
        className="min-h-0 overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground"
        resizable={{
          minWidth: T3TEAM_LEFT_SIDEBAR_MIN_WIDTH,
          shouldAcceptWidth: ({ nextWidth, wrapper }) =>
            wrapper.clientWidth - nextWidth >= T3TEAM_MAIN_CONTENT_MIN_WIDTH,
          storageKey: T3TEAM_LEFT_SIDEBAR_WIDTH_STORAGE_KEY,
        }}
      >
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <AppSidebarLens
            projects={store.projects}
            looseWorkspaceProjects={store.looseWorkspaceProjects}
            selectedId={selectedProjectId}
            expandedIds={store.expandedProjectIds}
            threads={visibleThreads}
            getThreadsForProject={getVisibleThreadsForProject}
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
        threads={visibleThreads}
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
