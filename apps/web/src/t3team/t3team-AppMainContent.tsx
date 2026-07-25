import type { ProjectShellProject } from "@t3tools/project-context";
import { useBackendState } from "~/t3team/backend/t3team-index";
import type {
  ProjectKickoffThreadInput,
  TicketKickoffThreadInput,
} from "~/t3team/t3team-kickoffTypes";
import type { ProjectDashboardMode } from "~/t3team/t3team-projectDashboardModeState";
import {
  readActiveThreadIdFromView,
  type ProjectThreadDisplayMode,
  type ProjectThread,
  type ViewState,
} from "~/t3team/t3team-types";
import { AppDashboardPane } from "~/t3team/t3team-AppDashboardPane";
import { AppMainContentHomeBrowser } from "~/t3team/t3team-AppMainContentHomeBrowser";
import { AppThreadPane } from "~/t3team/t3team-AppThreadPane";
import { isHomeProjectId } from "~/t3team/t3team-homeProject";
import { renderProjectSidecarPane } from "~/t3team/t3team-appMainContentPanes";
import { useThreadResolutionDebug } from "~/t3team/t3team-useThreadResolutionDebug";
import { useHomeProjectChat, useSyncActiveChatTarget } from "./t3team-AppMainContentShell";
import { useProjectWorkspaceAutoSync } from "~/t3team/hooks/t3team-useProjectWorkspaceAutoSync";
import {
  resolveEmbeddedThread,
  resolveThreadProject,
  resolveWorkHomeProject,
} from "~/t3team/t3team-appMainContentResolution";

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
  const { homeChatProject, homeChatThreadId } = useHomeProjectChat({
    projects,
    getThreadsForProject,
  });
  const showInitialSetup = !view && (reopenInitialSetup || allProjects.length === 0);
  const homeProject = resolveWorkHomeProject({
    allProjects,
    selectedProjectId,
    showInitialSetup,
    hasRouteView: Boolean(view),
  });
  const homeChatProjectThreads = homeChatProject ? getThreadsForProject(homeChatProject.id) : [];
  const homeBrowser = (
    <AppMainContentHomeBrowser
      onCreate={onCreate}
      onInlineProjectCreated={onInlineProjectCreated}
      showInitialSetup={showInitialSetup}
      showAside={!reopenInitialSetup && projects.length > 0}
      shouldInsetDesktopHeader={shouldInsetDesktopHeader}
      homeChatProject={homeChatProject}
      homeChatProjectThreads={homeChatProjectThreads}
      providers={backendState.providers}
      isConnected={backendState.connectionStatus === "connected"}
      onOpenHomeThread={(threadId) => {
        if (homeChatProject) onOpenThread(homeChatProject.id, threadId);
      }}
      onKickoffProjectThread={onKickoffProjectThread}
    />
  );

  useSyncActiveChatTarget({
    view,
    getThreadsForProject,
    homeChatProject,
    homeChatThreadId,
  });

  const activeThreadId = readActiveThreadIdFromView(view);
  const threadProject = resolveThreadProject({
    activeThreadId,
    view,
    allProjects,
    homeChatProject,
  });
  const threadProjectThreads = threadProject ? getThreadsForProject(threadProject.id) : [];
  const resolvedThread = activeThreadId
    ? (threadProjectThreads.find((candidate) => candidate.id === activeThreadId) ?? null)
    : null;
  const embeddedThread = resolveEmbeddedThread(view, threadProjectThreads);
  const viewProject = view
    ? (allProjects.find((candidate) => candidate.id === view.projectId) ?? null)
    : null;
  const workspaceSyncProject = threadProject ?? viewProject ?? homeProject;
  const workspaceSyncProjectThreads = workspaceSyncProject
    ? getThreadsForProject(workspaceSyncProject.id)
    : [];

  useProjectWorkspaceAutoSync({
    project: workspaceSyncProject,
    projectThreads: workspaceSyncProjectThreads,
  });

  useThreadResolutionDebug({
    routeProjectId: view?.projectId ?? null,
    routeThreadId: activeThreadId,
    resolvedProjectId: threadProject?.id ?? null,
    resolvedProjectWorkspaceRoot: threadProject?.workspace?.rootPath ?? null,
    projectThreadCount: threadProjectThreads.length,
    resolvedThreadId: resolvedThread?.id ?? null,
    resolvedThreadProjectId: resolvedThread?.projectId ?? null,
    resolvedThreadStatus: resolvedThread?.status ?? null,
    kickoffPending: resolvedThread?.kickoffPending ?? null,
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

    return homeBrowser;
  }

  if (view.type === "thread") {
    return (
      <AppThreadPane
        view={view}
        threadProject={threadProject}
        resolvedThread={resolvedThread}
        embeddedThread={embeddedThread}
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

  if (view.type === "dashboard" || view.type === "recipes") {
    return renderProjectSidecarPane({
      view,
      project,
      projectThreads: getThreadsForProject(project.id),
      activeThread: resolvedThread,
      activeDashboardMode,
      providers: backendState.providers,
      isConnected: backendState.connectionStatus === "connected",
      shouldInsetDesktopHeader,
      onOpenThread,
      onOpenFullThread,
      onThreadKickoffConsumed,
      onThreadDisplayModeChange,
      onKickoffProjectThread,
      onBackToDashboard,
      renderDashboard,
    });
  }

  if (view.type === "ticket")
    return <>{renderTicketDetail(project, view.ticketId, view.embeddedThreadId)}</>;

  return homeBrowser;
}
