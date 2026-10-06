import type { ProjectShellProject } from "@t3tools/project-context";
import { useAllEnvironmentProjectSnapshotsReady } from "~/state/entities";
import { useBackendState } from "~/t3team/backend/t3team-index";
import { ProjectMyWorkLoadingState } from "~/t3team/t3team-projectMyWorkContentState";
import type {
  ProjectKickoffThreadInput,
  TicketKickoffThreadInput,
} from "~/t3team/t3team-kickoffTypes";
import type { ProjectDashboardMode } from "~/t3team/t3team-projectDashboardModeState";
import type { ProjectThreadDisplayMode, ProjectThread, ViewState } from "~/t3team/t3team-types";
import { AppDashboardPane } from "~/t3team/t3team-AppDashboardPane";
import { AppMainContentHomeBrowser } from "~/t3team/t3team-AppMainContentHomeBrowser";
import { AllProjectsMyWorkView } from "~/t3team/t3team-AllProjectsMyWorkView";
import { AppDraftPane } from "~/t3team/t3team-AppDraftPane";
import { AppThreadPane } from "~/t3team/t3team-AppThreadPane";
import { useT3TeamScratchHomeChat } from "~/t3team/t3team-useScratchHomeChat";
import {
  opensAllProjectsMyWorkHome,
  resolveWorkHomeProject,
} from "~/t3team/t3team-appMainContentResolution";
import { resolveT3TeamSetupSurfaceReason } from "~/t3team/t3team-setupSurfaceReason";
import { useAppMainContentThreadResolution } from "~/t3team/t3team-useAppMainContentThreadResolution";

type MainContentProps = {
  view: ViewState | null;
  activeDashboardMode: ProjectDashboardMode;
  selectedProjectId: string | null;
  projects: ProjectShellProject[];
  allProjects: ProjectShellProject[];
  reopenInitialSetup?: boolean;
  shouldInsetDesktopHeader?: boolean;
  getThreadsForProject: (projectId: string) => ProjectThread[];
  onOpenTicket: (projectId: string, ticketId: string) => void;
  onOpenThread: (projectId: string, threadId: string) => void;
  onOpenFullThread: (projectId: string, threadId: string) => void;
  onOpenEmbeddedThread: (projectId: string, threadId: string) => void;
  onCloseEmbeddedThread?: () => void;
  onKickoffProjectThread: (input: ProjectKickoffThreadInput) => void;
  onKickoffTicketThread: (input: TicketKickoffThreadInput) => void;
  onThreadKickoffConsumed: (threadId: string) => void;
  onThreadDisplayModeChange: (threadId: string, displayMode: ProjectThreadDisplayMode) => void;
  onBackToDashboard: (projectId: string) => void;
  onCreate: () => void;
  onInlineProjectCreated: (project: ProjectShellProject) => void;
  renderDashboard: (project: ProjectShellProject) => React.ReactNode;
  renderTicketDetail: (
    project: ProjectShellProject,
    ticketId: string,
    activeThreadId?: string,
  ) => React.ReactNode;
};

export function AppMainContent({
  view,
  activeDashboardMode,
  selectedProjectId,
  projects,
  allProjects,
  reopenInitialSetup = false,
  shouldInsetDesktopHeader = false,
  getThreadsForProject,
  onOpenTicket,
  onOpenThread,
  onOpenFullThread,
  onOpenEmbeddedThread,
  onCloseEmbeddedThread,
  onKickoffProjectThread,
  onBackToDashboard,
  onCreate,
  onInlineProjectCreated,
  renderDashboard,
  renderTicketDetail,
  onThreadKickoffConsumed,
  onThreadDisplayModeChange,
}: MainContentProps) {
  const backendState = useBackendState();
  // Project-less chats live in upstream's Scratch project ("No project").
  const { scratchProject, startScratch } = useT3TeamScratchHomeChat(allProjects);
  // Before the first project snapshot an empty list means "not loaded yet", not "first run":
  // judging it as first run flashed the setup surface on every launch.
  const projectsLoading = !useAllEnvironmentProjectSnapshotsReady() && allProjects.length === 0;
  const showInitialSetup =
    !view && (reopenInitialSetup || (!projectsLoading && allProjects.length === 0));
  const setupSurfaceReason = resolveT3TeamSetupSurfaceReason({
    allProjects,
    selectedProjectId,
    reopenInitialSetup,
  });
  const homeProject = resolveWorkHomeProject({
    allProjects,
    selectedProjectId,
    showInitialSetup,
    hasRouteView: Boolean(view),
  });
  const homeBrowser = (
    <AppMainContentHomeBrowser
      onCreate={onCreate}
      onInlineProjectCreated={onInlineProjectCreated}
      showInitialSetup={showInitialSetup}
      setupSurfaceReason={setupSurfaceReason}
      showAside={!reopenInitialSetup && projects.length > 0}
      shouldInsetDesktopHeader={shouldInsetDesktopHeader}
      scratchProject={scratchProject}
      onStartScratch={startScratch}
      providers={backendState.providers}
      isConnected={backendState.connectionStatus === "connected"}
      onOpenHomeThread={(threadId) => {
        if (scratchProject) onOpenThread(scratchProject.id, threadId);
      }}
      onKickoffProjectThread={onKickoffProjectThread}
    />
  );

  const { threadProject, resolvedThread, viewProject } = useAppMainContentThreadResolution({
    view,
    allProjects,
    homeProject,
    getThreadsForProject,
  });

  if (!view) {
    if (homeProject) {
      return (
        <AppDashboardPane
          activeDashboardMode={activeDashboardMode}
          project={homeProject}
          projectThreads={getThreadsForProject(homeProject.id)}
          activeThread={null}
          activeThreadId={null}
          providers={backendState.providers}
          isConnected={backendState.connectionStatus === "connected"}
          onOpenThread={onOpenThread}
          onOpenFullThread={onOpenFullThread}
          onThreadKickoffConsumed={onThreadKickoffConsumed}
          onRememberEmbeddedThread={(threadId) => onThreadDisplayModeChange(threadId, "embedded")}
          onKickoffProjectThread={onKickoffProjectThread}
          renderDashboard={renderDashboard}
        />
      );
    }
    // Startup lands on your work when there is any; the new conversation is one click away.
    if (
      opensAllProjectsMyWorkHome({
        allProjects,
        selectedProjectId,
        showInitialSetup,
        hasRouteView: false,
      })
    ) {
      return <AllProjectsMyWorkView onOpenTicket={onOpenTicket} />;
    }
    if (projectsLoading && !reopenInitialSetup) {
      return (
        <div className="flex w-full flex-col p-4 sm:p-6">
          <ProjectMyWorkLoadingState />
        </div>
      );
    }

    return homeBrowser;
  }

  // Like a draft, this resolves no project — its subject is the viewer, not a project — so it has
  // to be handled before any project lookup.
  if (view.type === "all-my-work") {
    return <AllProjectsMyWorkView onOpenTicket={onOpenTicket} />;
  }

  // A draft has no project or thread of its own yet, so it resolves nothing
  // above and must be handled before any project lookup.
  if (view.type === "draft") {
    return <AppDraftPane draftId={view.draftId} />;
  }

  if (view.type === "thread") {
    return (
      <AppThreadPane
        view={view}
        threadProject={threadProject}
        resolvedThread={resolvedThread}
        onOpenTicket={onOpenTicket}
        onOpenEmbeddedThread={onOpenEmbeddedThread}
        onCloseEmbeddedThread={() =>
          onCloseEmbeddedThread?.() ?? onOpenFullThread(view.projectId, view.threadId)
        }
        onThreadKickoffConsumed={onThreadKickoffConsumed}
        onRememberFullThread={(threadId) => onThreadDisplayModeChange(threadId, "thread")}
        onBackToDashboard={onBackToDashboard}
      />
    );
  }

  const project = viewProject;
  if (!project) return homeBrowser;

  if (view.type === "dashboard") {
    return (
      <AppDashboardPane
        activeDashboardMode={activeDashboardMode}
        project={project}
        projectThreads={getThreadsForProject(project.id)}
        activeThread={resolvedThread}
        activeThreadId={view.embeddedThreadId ?? null}
        providers={backendState.providers}
        isConnected={backendState.connectionStatus === "connected"}
        onOpenThread={onOpenThread}
        onOpenFullThread={onOpenFullThread}
        onThreadKickoffConsumed={onThreadKickoffConsumed}
        onRememberEmbeddedThread={(threadId) => onThreadDisplayModeChange(threadId, "embedded")}
        onKickoffProjectThread={onKickoffProjectThread}
        renderDashboard={renderDashboard}
      />
    );
  }

  if (view.type === "ticket")
    return <>{renderTicketDetail(project, view.ticketId, view.embeddedThreadId)}</>;

  return homeBrowser;
}
