import type { ProjectDashboardMode } from "~/t3work/t3work-projectDashboardModeState";
import type { ProjectThread, ProjectThreadDisplayMode, ViewState } from "~/t3work/t3work-types";
import {
  embeddedThreadIdFromParentView,
  mergeEmbeddedThreadIdFromStore,
} from "~/t3work/t3work-viewStateMerge";
import type { useProjectStore } from "~/t3work/hooks/t3work-useProjectStore";

export type { ProjectThreadDisplayMode } from "~/t3work/t3work-types";

type ProjectThreadViewStateInput = {
  projectId: string;
  threadId: string;
  ticketId?: string;
  dashboardMode?: ProjectDashboardMode;
  displayMode?: ProjectThreadDisplayMode;
};

export function buildProjectThreadViewState({
  projectId,
  threadId,
  ticketId,
  dashboardMode,
  displayMode = "embedded",
}: ProjectThreadViewStateInput): ViewState {
  if (displayMode === "thread") {
    return {
      type: "thread",
      projectId,
      threadId,
    };
  }

  if (ticketId) {
    return {
      type: "ticket",
      projectId,
      ticketId,
      embeddedThreadId: threadId,
    };
  }

  if (dashboardMode || displayMode === "embedded") {
    return {
      type: "dashboard",
      projectId,
      embeddedThreadId: threadId,
    };
  }

  return {
    type: "thread",
    projectId,
    threadId,
  };
}

export function buildExistingProjectThreadViewState(
  projectId: string,
  thread: Pick<ProjectThread, "id" | "ticketId" | "dashboardMode" | "displayMode">,
): ViewState {
  return buildProjectThreadViewState({
    projectId,
    threadId: thread.id,
    ...(thread.ticketId ? { ticketId: thread.ticketId } : {}),
    ...(thread.dashboardMode ? { dashboardMode: thread.dashboardMode } : {}),
    displayMode:
      thread.displayMode ?? (thread.ticketId || thread.dashboardMode ? "embedded" : "thread"),
  });
}

export function isEmbeddedProjectThread(
  thread: Pick<ProjectThread, "ticketId" | "dashboardMode"> | null | undefined,
): boolean {
  return Boolean(thread?.ticketId || thread?.dashboardMode);
}

export function mergeRouteAndStoreView(
  routeView: ViewState | null | undefined,
  storeView: ViewState | null,
): ViewState | null {
  if (!routeView) {
    return storeView;
  }

  if (!storeView || routeView.projectId !== storeView.projectId) {
    return routeView;
  }

  return mergeEmbeddedThreadIdFromStore(routeView, storeView);
}

export { embeddedThreadIdFromParentView as embeddedThreadIdForDashboardModeSwitch } from "~/t3work/t3work-viewStateMerge";

type ProjectStore = ReturnType<typeof useProjectStore>;
type OnOpenDashboard =
  | ((
      projectId: string,
      dashboardMode?: ProjectDashboardMode,
      embeddedThreadId?: string | null,
    ) => void)
  | undefined;

export function selectProjectDashboardMode(input: {
  activeView: ViewState | null;
  dashboardMode: ProjectDashboardMode;
  onOpenDashboard: OnOpenDashboard;
  projectId: string;
  store: ProjectStore;
}) {
  const { activeView, dashboardMode, onOpenDashboard, projectId, store } = input;
  const resolvedProjectId = store.resolveProjectId(projectId);
  store.selectProject(resolvedProjectId);
  onOpenDashboard?.(
    resolvedProjectId,
    dashboardMode,
    embeddedThreadIdFromParentView(activeView, resolvedProjectId) ?? null,
  );
}
