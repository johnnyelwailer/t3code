import type { ServerProvider } from "@t3tools/contracts";
import type { ProjectShellProject } from "@t3tools/project-context";
import type { ProjectKickoffThreadInput } from "~/t3work/t3work-kickoffTypes";
import type { ProjectDashboardMode } from "~/t3work/t3work-projectDashboardModeState";
import type { ProjectThread, ProjectThreadDisplayMode, ViewState } from "~/t3work/t3work-types";
import { AppDashboardPane } from "~/t3work/t3work-AppDashboardPane";
import { AppRecipeManagerPane } from "~/t3work/t3work-AppRecipeManagerPane";

type SidecarPaneView = Extract<ViewState, { type: "dashboard" | "recipes" }>;

type SidecarPaneInput = {
  readonly view: SidecarPaneView;
  readonly project: ProjectShellProject;
  readonly projectThreads: ProjectThread[];
  readonly activeThread: ProjectThread | null;
  readonly activeDashboardMode: ProjectDashboardMode;
  readonly providers: ReadonlyArray<ServerProvider>;
  readonly isConnected: boolean;
  readonly shouldInsetDesktopHeader: boolean;
  readonly onOpenThread: (projectId: string, threadId: string) => void;
  readonly onOpenFullThread: (projectId: string, threadId: string) => void;
  readonly onThreadKickoffConsumed: (threadId: string) => void;
  readonly onThreadDisplayModeChange: (
    threadId: string,
    displayMode: ProjectThreadDisplayMode,
  ) => void;
  readonly onKickoffProjectThread: (input: ProjectKickoffThreadInput) => void;
  readonly onBackToDashboard: (projectId: string) => void;
  readonly renderDashboard: (project: ProjectShellProject) => React.ReactNode;
};

export function renderProjectSidecarPane(input: SidecarPaneInput) {
  const common = {
    activeDashboardMode: input.activeDashboardMode,
    project: input.project,
    projectThreads: input.projectThreads,
    activeThread: input.activeThread,
    activeThreadId: input.view.embeddedThreadId ?? null,
    providers: input.providers,
    isConnected: input.isConnected,
    onOpenThread: input.onOpenThread,
    onOpenFullThread: input.onOpenFullThread,
    onThreadKickoffConsumed: input.onThreadKickoffConsumed,
    onRememberEmbeddedThread: (threadId: string) =>
      input.onThreadDisplayModeChange(threadId, "embedded"),
    onKickoffProjectThread: input.onKickoffProjectThread,
  };

  if (input.view.type === "dashboard") {
    return <AppDashboardPane {...common} renderDashboard={input.renderDashboard} />;
  }

  return (
    <AppRecipeManagerPane
      {...common}
      shouldInsetDesktopHeader={input.shouldInsetDesktopHeader}
      onBackToDashboard={input.onBackToDashboard}
    />
  );
}
