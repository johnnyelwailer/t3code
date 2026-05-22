import type { ProjectShellProject } from "@t3tools/project-context";
import type { ModelSelection, ProviderInteractionMode, RuntimeMode } from "@t3tools/contracts";
import type { T3WorkContextAttachment } from "~/t3work/t3work-contextAttachment";
import { ThreadChatView } from "~/t3work/chat/t3work-ThreadChatView";
import { useBackendState } from "~/t3work/backend/t3work-index";
import type { ProjectThread, ViewState } from "~/t3work/t3work-types";
import { ProjectDashboardKickoffAside } from "~/t3work/t3work-ProjectDashboardKickoffAside";
import { ResizableRightSidebarLayout } from "~/t3work/t3work-ResizableRightSidebarLayout";
import { AppMainContentHomeEmptyState } from "~/t3work/t3work-AppMainContentHomeEmptyState";
import { isHomeProjectId } from "~/t3work/t3work-homeProject";
import { useThreadResolutionDebug } from "~/t3work/t3work-useThreadResolutionDebug";
import { useHomeProjectChat, useSyncActiveChatTarget } from "./t3work-AppMainContentShell";

type MainContentProps = {
  view: ViewState | null;
  projects: ProjectShellProject[];
  allProjects: ProjectShellProject[];
  getThreadsForProject: (projectId: string) => ProjectThread[];
  onOpenThread: (projectId: string, threadId: string) => void;
  onKickoffProjectThread: (input: {
    projectId: string;
    kickoffMessage: string;
    kickoffModelSelection: ModelSelection;
    kickoffRuntimeMode: RuntimeMode;
    kickoffInteractionMode: ProviderInteractionMode;
    kickoffContextAttachments: ReadonlyArray<T3WorkContextAttachment>;
  }) => void;
  onThreadKickoffConsumed: (threadId: string) => void;
  onBackToDashboard: (projectId: string) => void;
  onCreate: () => void;
  onInlineProjectCreated: (project: ProjectShellProject) => void;
  renderDashboard: (project: ProjectShellProject) => React.ReactNode;
  renderTicketDetail: (project: ProjectShellProject, ticketId: string) => React.ReactNode;
};

export function AppMainContent({
  view,
  projects,
  allProjects,
  getThreadsForProject,
  onOpenThread,
  onKickoffProjectThread,
  onBackToDashboard,
  onCreate,
  onInlineProjectCreated,
  renderDashboard,
  renderTicketDetail,
  onThreadKickoffConsumed,
}: MainContentProps) {
  const backendState = useBackendState();
  const { homeChatProject, homeChatThreadId } = useHomeProjectChat({
    projects,
    getThreadsForProject,
  });
  const isFirstRunSetup = !view && projects.length === 0;
  const homeBrowserEmpty = (
    <AppMainContentHomeEmptyState
      onCreate={onCreate}
      onInlineProjectCreated={onInlineProjectCreated}
      isFirstRunSetup={isFirstRunSetup}
      showAside={projects.length > 0}
      homeChatProject={homeChatProject}
      homeChatProjectThreads={homeChatProject ? getThreadsForProject(homeChatProject.id) : []}
      providers={backendState.providers}
      isConnected={backendState.connectionStatus === "connected"}
      onOpenHomeThread={(threadId) => {
        if (homeChatProject) onOpenThread(homeChatProject.id, threadId);
      }}
      onKickoffHomeThread={(
        kickoffMessage,
        kickoffModelSelection,
        kickoffRuntimeMode,
        kickoffInteractionMode,
        kickoffContextAttachments,
      ) => {
        if (!homeChatProject) return;
        onKickoffProjectThread({
          projectId: homeChatProject.id,
          kickoffMessage,
          kickoffModelSelection,
          kickoffRuntimeMode,
          kickoffInteractionMode,
          kickoffContextAttachments,
        });
      }}
    />
  );
  useSyncActiveChatTarget({
    view,
    getThreadsForProject,
    homeChatProject,
    homeChatThreadId,
  });

  const threadView = view?.type === "thread" ? view : null;
  const threadProject = threadView
    ? (allProjects.find((candidate) => candidate.id === threadView.projectId) ??
      (isHomeProjectId(threadView.projectId) ? homeChatProject : null))
    : null;
  const threadProjectThreads = threadProject ? getThreadsForProject(threadProject.id) : [];
  const resolvedThread = threadView
    ? (threadProjectThreads.find((candidate) => candidate.id === threadView.threadId) ?? null)
    : null;

  useThreadResolutionDebug({
    routeProjectId: threadView?.projectId ?? null,
    routeThreadId: threadView?.threadId ?? null,
    resolvedProjectId: threadProject?.id ?? null,
    resolvedProjectWorkspaceRoot: threadProject?.workspace?.rootPath ?? null,
    projectThreadCount: threadProjectThreads.length,
    resolvedThreadId: resolvedThread?.id ?? null,
    resolvedThreadProjectId: resolvedThread?.projectId ?? null,
    resolvedThreadStatus: resolvedThread?.status ?? null,
    kickoffPending: resolvedThread?.kickoffPending ?? null,
  });

  if (!view) return homeBrowserEmpty;

  if (view.type === "thread") {
    return (
      <ThreadChatView
        threadId={view.threadId}
        projectId={view.projectId}
        projectTitle={threadProject?.title ?? view.projectId}
        {...(threadProject?.workspace?.rootPath
          ? { projectWorkspaceRoot: threadProject.workspace.rootPath }
          : {})}
        title={resolvedThread?.title ?? "New thread"}
        {...(resolvedThread?.kickoffMessage
          ? { kickoffMessage: resolvedThread.kickoffMessage }
          : {})}
        {...(resolvedThread?.kickoffPending && resolvedThread.kickoffMessage
          ? { initialUserMessage: resolvedThread.kickoffMessage }
          : {})}
        {...(resolvedThread?.kickoffModelSelection
          ? { initialModelSelection: resolvedThread.kickoffModelSelection }
          : {})}
        {...(resolvedThread?.kickoffRuntimeMode
          ? { initialRuntimeMode: resolvedThread.kickoffRuntimeMode }
          : {})}
        {...(resolvedThread?.kickoffInteractionMode
          ? { initialInteractionMode: resolvedThread.kickoffInteractionMode }
          : {})}
        onInitialUserMessageSent={() => {
          if (resolvedThread) onThreadKickoffConsumed(resolvedThread.id);
        }}
        onBack={() => onBackToDashboard(view.projectId)}
      />
    );
  }

  const project = projects.find((candidate) => candidate.id === view.projectId);
  if (!project) {
    return homeBrowserEmpty;
  }

  if (view.type === "dashboard") {
    return (
      <ResizableRightSidebarLayout
        storageKey="t3work_dashboard_right_sidebar"
        minAsideWidth={22 * 16}
        defaultAsideWidth={24 * 16}
        main={
          <div className="flex h-full min-h-0 min-w-0 flex-1 overflow-hidden">
            {renderDashboard(project)}
          </div>
        }
        aside={
          <ProjectDashboardKickoffAside
            project={project}
            projectThreads={getThreadsForProject(project.id)}
            providers={backendState.providers}
            isConnected={backendState.connectionStatus === "connected"}
            onOpenThread={(threadId) => onOpenThread(project.id, threadId)}
            onKickoffThread={(
              kickoffMessage,
              kickoffModelSelection,
              kickoffRuntimeMode,
              kickoffInteractionMode,
              kickoffContextAttachments,
            ) => {
              onKickoffProjectThread({
                projectId: project.id,
                kickoffMessage,
                kickoffModelSelection,
                kickoffRuntimeMode,
                kickoffInteractionMode,
                kickoffContextAttachments,
              });
            }}
          />
        }
      />
    );
  }

  if (view.type === "ticket") return <>{renderTicketDetail(project, view.ticketId)}</>;

  return homeBrowserEmpty;
}
