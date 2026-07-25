import { useEffect } from "react";
import type { ServerProvider } from "@t3tools/contracts";
import type { ProjectShellProject } from "@t3tools/project-context";
import type { ProjectKickoffThreadInput } from "~/t3team/t3team-kickoffTypes";
import type { ProjectDashboardMode } from "~/t3team/t3team-projectDashboardModeState";
import { ProjectDashboardKickoffAside } from "~/t3team/t3team-ProjectDashboardKickoffAside";
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

  return (
    <T3TeamDashboardRecipeViewProvider>
      <T3TeamDashboardRecipeActionProvider>
        <ResizableRightSidebarLayout
          storageKey="t3team_dashboard_right_sidebar"
          collapsedStorageKey={getProjectDashboardRightSidebarCollapsedStorageKey({
            projectId: project.id,
            dashboardMode: activeDashboardMode,
            embeddedThreadId: activeThreadId,
          })}
          minAsideWidth={22 * 16}
          defaultAsideWidth={24 * 16}
          mobileDefaultPanel={activeThread ? "aside" : "main"}
          mobileMainLabel={activeDashboardMode === "backlog" ? "Backlog" : "My work"}
          mobileAsideLabel={activeThread ? "Chat" : "Agent"}
          main={
            <div className="flex h-full min-h-0 min-w-0 flex-1 overflow-hidden">
              {renderDashboard(project)}
            </div>
          }
          aside={
            <ProjectDashboardKickoffAside
              project={project}
              dashboardMode={activeDashboardMode}
              projectThreads={projectThreads}
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
      </T3TeamDashboardRecipeActionProvider>
    </T3TeamDashboardRecipeViewProvider>
  );
}
