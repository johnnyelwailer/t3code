import type { ProjectShellProject } from "@t3tools/project-context";
import { useBackendState } from "~/t3work/backend/t3work-index";
import type {
  ProjectKickoffThreadInput,
  TicketKickoffThreadInput,
} from "~/t3work/t3work-kickoffTypes";
import type { ProjectDashboardMode } from "~/t3work/t3work-projectDashboardModeState";
import {
  readActiveThreadIdFromView,
  type ProjectThreadDisplayMode,
  type ProjectThread,
  type ViewState,
} from "~/t3work/t3work-types";
import { AppDashboardPane } from "~/t3work/t3work-AppDashboardPane";
import { AppMainContentHomeBrowser } from "~/t3work/t3work-AppMainContentHomeBrowser";
import { AppThreadPane } from "~/t3work/t3work-AppThreadPane";
import { isHomeProjectId } from "~/t3work/t3work-homeProject";
import { useThreadResolutionDebug } from "~/t3work/t3work-useThreadResolutionDebug";
import { useHomeProjectChat, useSyncActiveChatTarget } from "./t3work-AppMainContentShell";
import { useProjectWorkspaceAutoSync } from "~/t3work/hooks/t3work-useProjectWorkspaceAutoSync";

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
  const homeProject =
    !showInitialSetup && !view
      ? (allProjects.find((candidate) => candidate.id === selectedProjectId) ??
        allProjects[0] ??
        null)
      : null;
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
  const threadProject =
    activeThreadId && view
      ? (allProjects.find((candidate) => candidate.id === view.projectId) ??
        (view.type === "thread" && isHomeProjectId(view.projectId) ? homeChatProject : null))
      : null;
  const threadProjectThreads = threadProject ? getThreadsForProject(threadProject.id) : [];
  const resolvedThread = activeThreadId
    ? (threadProjectThreads.find((candidate) => candidate.id === activeThreadId) ?? null)
    : null;
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
        onOpenTicket={onOpenTicket}
        onOpenEmbeddedThread={onOpenEmbeddedThread}
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
