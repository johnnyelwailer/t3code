import { useEffect } from "react";
import type { ServerProvider } from "@t3tools/contracts";
import type { ProjectShellProject } from "@t3tools/project-context";
import type { ProjectKickoffThreadInput } from "~/t3team/t3team-kickoffTypes";
import type { ProjectDashboardMode } from "~/t3team/t3team-projectDashboardModeState";
import { ProjectDashboardKickoffAside } from "~/t3team/t3team-ProjectDashboardKickoffAside";
import { DigestPrAside } from "~/t3team/t3team-DigestPrAside";
import { closeDigestPullRequest, useDigestPrAsideStore } from "~/t3team/t3team-digestPrAsideStore";
import { DigestRecipeCatalogProvider } from "~/t3team/t3team-digestRecipeCatalog";
import { useDigestRecipeLaunchStore } from "~/t3team/t3team-digestRecipeLaunchStore";
import { T3TeamDashboardRecipeActionProvider } from "~/t3team/t3team-dashboardRecipeActions";
import { useProjectWorkspaceAutoSync } from "~/t3team/hooks/t3team-useProjectWorkspaceAutoSync";
import { ResizableRightSidebarLayout } from "~/t3team/t3team-ResizableRightSidebarLayout";
import { T3TeamDashboardRecipeViewProvider } from "~/t3team/t3team-dashboardRecipeViewContext";
import { getProjectDashboardRightSidebarCollapsedStorageKey } from "~/t3team/t3team-rightSidebarPersistence";
import type { ProjectThread } from "~/t3team/t3team-types";

export function AppDashboardPane({
  activeDashboardMode,
  project,
  projectThreads,
  activeThread,
  activeThreadId,
  providers,
  isConnected,
  onOpenThread,
  onOpenFullThread,
  onThreadKickoffConsumed,
  onRememberEmbeddedThread,
  onKickoffProjectThread,
  renderDashboard,
}: {
  activeDashboardMode: ProjectDashboardMode;
  project: ProjectShellProject;
  projectThreads: ProjectThread[];
  activeThread: ProjectThread | null;
  activeThreadId: string | null;
  providers: ReadonlyArray<ServerProvider>;
  isConnected: boolean;
  onOpenThread: (projectId: string, threadId: string) => void;
  onOpenFullThread: (projectId: string, threadId: string) => void;
  onThreadKickoffConsumed: (threadId: string) => void;
  onRememberEmbeddedThread: (threadId: string) => void;
  onKickoffProjectThread: (input: ProjectKickoffThreadInput) => void;
  renderDashboard: (project: ProjectShellProject) => React.ReactNode;
}) {
  useProjectWorkspaceAutoSync({
    project,
    projectThreads,
    uiState: {
      surface: "dashboard-shell",
      activeDashboardMode,
      activeThreadId,
      activeThreadStatus: activeThread?.status ?? null,
      visibleThreadCount: projectThreads.length,
    },
  });

  useEffect(() => {
    if (!activeThread) {
      return;
    }

    onRememberEmbeddedThread(activeThread.id);
  }, [activeThread, onRememberEmbeddedThread]);

  // Opening a PR, or staging a recipe, from the digest raises the drawer where the aside cannot
  // sit beside the view.
  // Only this project's: a detail opened on another project's dashboard neither labels nor raises
  // this one's drawer.
  const projectId: string = project.id;
  const openedPullRequest = useDigestPrAsideStore((state) =>
    state.pullRequest?.projectId === projectId ? state.pullRequest : null,
  );
  const openedTicket = useDigestPrAsideStore((state) =>
    state.ticket?.projectId === projectId ? state.ticket : null,
  );
  // Picking a thread hands the aside to it: an open PR or ticket would otherwise hide the chat.
  useEffect(() => {
    if (activeThreadId !== null) closeDigestPullRequest();
  }, [activeThreadId]);
  // A detail belongs to the screen it was opened on: leaving the dashboard closes it.
  useEffect(() => closeDigestPullRequest, []);
  const recipeRequest = useDigestRecipeLaunchStore((state) => state.request);
  return (
    <T3TeamDashboardRecipeViewProvider>
      <T3TeamDashboardRecipeActionProvider>
        <DigestRecipeCatalogProvider project={project} launchable={activeThread === null}>
          <ResizableRightSidebarLayout
            storageKey="t3team_dashboard_right_sidebar"
            collapsedStorageKey={getProjectDashboardRightSidebarCollapsedStorageKey({
              projectId: project.id,
            })}
            // Detail first: the dashboard owns the width until something is opened beside it (a
            // thread, a PR, a ticket, a staged recipe), which reveals the aside on its own.
            defaultCollapsed
            minAsideWidth={22 * 16}
            defaultAsideWidth={24 * 16}
            // The digest reflows down to one column, so it needs less than a page view: at 36rem a
            // 1280px window with the left sidebar open (a ~1040px pane) still fits the aside
            // beside it, instead of falling back to the bottom drawer on an ordinary laptop.
            minMainWidth={36 * 16}
            mobileDefaultPanel={activeThread ? "aside" : "main"}
            mobileMainLabel={activeDashboardMode === "backlog" ? "Backlog" : "My work"}
            mobileAsideLabel={
              openedPullRequest
                ? "Pull request"
                : openedTicket
                  ? openedTicket.ticketId
                  : activeThread
                    ? "Chat"
                    : "Agent"
            }
            mobileAsideRequest={openedPullRequest ?? openedTicket ?? recipeRequest}
            asideThreadKey={activeThreadId}
            main={
              <div className="flex h-full min-h-0 min-w-0 flex-1 overflow-hidden">
                {renderDashboard(project)}
              </div>
            }
            aside={
              <DigestPrAside
                project={project}
                projectThreads={projectThreads}
                onRememberEmbeddedThread={onRememberEmbeddedThread}
                fallback={
                  <ProjectDashboardKickoffAside
                    // One composer per project: a recipe staged for project A's PR must not stay
                    // staged (and launch) once the dashboard shows project B.
                    key={project.id}
                    project={project}
                    dashboardMode={activeDashboardMode}
                    activeThread={activeThread}
                    providers={providers}
                    isConnected={isConnected}
                    onOpenThread={(threadId) => onOpenThread(project.id, threadId)}
                    onOpenFullThread={(threadId) => onOpenFullThread(project.id, threadId)}
                    onThreadKickoffConsumed={onThreadKickoffConsumed}
                    onKickoffThread={(
                      kickoffMessage,
                      kickoffPending,
                      kickoffModelSelection,
                      kickoffRuntimeMode,
                      kickoffInteractionMode,
                      selectedToolIds,
                      kickoffContextAttachments,
                      kickoffWorkflow,
                    ) => {
                      onKickoffProjectThread({
                        projectId: project.id,
                        dashboardMode: activeDashboardMode,
                        kickoffMessage,
                        ...(kickoffPending !== undefined ? { kickoffPending } : {}),
                        kickoffModelSelection,
                        kickoffRuntimeMode,
                        kickoffInteractionMode,
                        selectedToolIds,
                        kickoffContextAttachments,
                        ...(kickoffWorkflow ? { kickoffWorkflow } : {}),
                      });
                    }}
                  />
                }
              />
            }
          />
        </DigestRecipeCatalogProvider>
      </T3TeamDashboardRecipeActionProvider>
    </T3TeamDashboardRecipeViewProvider>
  );
}
