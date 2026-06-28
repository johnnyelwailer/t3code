import { useEffect } from "react";
import type { ServerProvider } from "@t3tools/contracts";
import type { ProjectShellProject } from "@t3tools/project-context";
import type { ProjectKickoffThreadInput } from "~/t3work/t3work-kickoffTypes";
import { useAddToChat } from "~/t3work/hooks/t3work-useAddToChat";
import { ProjectDashboardKickoffAside } from "~/t3work/t3work-ProjectDashboardKickoffAside";
import { ProjectRecipeManagerPage } from "~/t3work/t3work-ProjectRecipeManagerPage";
import { T3workDashboardRecipeActionProvider } from "~/t3work/t3work-dashboardRecipeActions";
import { T3workDashboardRecipeViewProvider } from "~/t3work/t3work-dashboardRecipeViewContext";
import { buildRecipeManagerChatRequest } from "~/t3work/t3work-recipeManagerModel";
import { ResizableRightSidebarLayout } from "~/t3work/t3work-ResizableRightSidebarLayout";
import { useProjectWorkspaceAutoSync } from "~/t3work/hooks/t3work-useProjectWorkspaceAutoSync";
import type { ProjectDashboardMode } from "~/t3work/t3work-projectDashboardModeState";
import type { ProjectThread } from "~/t3work/t3work-types";

export type AppRecipeManagerPaneProps = {
  activeDashboardMode: ProjectDashboardMode;
  project: ProjectShellProject;
  projectThreads: ProjectThread[];
  activeThread: ProjectThread | null;
  activeThreadId: string | null;
  providers: ReadonlyArray<ServerProvider>;
  isConnected: boolean;
  shouldInsetDesktopHeader?: boolean;
  onOpenThread: (projectId: string, threadId: string) => void;
  onOpenFullThread: (projectId: string, threadId: string) => void;
  onThreadKickoffConsumed: (threadId: string) => void;
  onRememberEmbeddedThread: (threadId: string) => void;
  onKickoffProjectThread: (input: ProjectKickoffThreadInput) => void;
  onBackToDashboard: (projectId: string) => void;
};

export function AppRecipeManagerPane({
  activeDashboardMode,
  project,
  projectThreads,
  activeThread,
  activeThreadId,
  providers,
  isConnected,
  shouldInsetDesktopHeader = false,
  onOpenThread,
  onOpenFullThread,
  onThreadKickoffConsumed,
  onRememberEmbeddedThread,
  onKickoffProjectThread,
  onBackToDashboard,
}: AppRecipeManagerPaneProps) {
  const { addToChatFromRequest } = useAddToChat();
  useProjectWorkspaceAutoSync({
    project,
    projectThreads,
    uiState: {
      surface: "recipe-manager",
      activeDashboardMode,
      activeThreadId,
      activeThreadStatus: activeThread?.status ?? null,
      visibleThreadCount: projectThreads.length,
    },
  });

  useEffect(() => {
    if (!activeThread) return;
    onRememberEmbeddedThread(activeThread.id);
  }, [activeThread, onRememberEmbeddedThread]);

  return (
    <T3workDashboardRecipeViewProvider>
      <T3workDashboardRecipeActionProvider>
        <ResizableRightSidebarLayout
          storageKey="t3work_recipe_manager_right_sidebar"
          collapsedStorageKey={`t3work:right-sidebar:recipe-manager:v1:${project.id}:${activeThreadId ?? "__root__"}`}
          minAsideWidth={22 * 16}
          defaultAsideWidth={24 * 16}
          mobileDefaultPanel={activeThread ? "aside" : "main"}
          mobileMainLabel="Recipes"
          mobileAsideLabel={activeThread ? "Chat" : "Agent"}
          main={
            <ProjectRecipeManagerPage
              project={project}
              shouldInsetDesktopHeader={shouldInsetDesktopHeader}
              onBack={() => onBackToDashboard(project.id)}
              onEditRecipeWithChat={(recipe) =>
                void addToChatFromRequest(buildRecipeManagerChatRequest({ project, recipe }))
              }
            />
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
      </T3workDashboardRecipeActionProvider>
    </T3workDashboardRecipeViewProvider>
  );
}
