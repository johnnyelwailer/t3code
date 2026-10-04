import type { ProjectDashboardMode } from "~/t3team/t3team-projectDashboardModeState";
import type { ProjectThread, ProjectThreadDisplayMode, ViewState } from "~/t3team/t3team-types";
import {
  embeddedThreadIdFromParentView,
  mergeEmbeddedThreadIdFromStore,
} from "~/t3team/t3team-viewStateMerge";
import type { useProjectStore } from "~/t3team/hooks/t3team-useProjectStore";

export type { ProjectThreadDisplayMode } from "~/t3team/t3team-types";

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

/**
 * The route is the source of truth for which view is open, but it can lag the
 * store (URL navigation is async). Until it catches up, a dashboard/ticket
 * route view inherits the store's embeddedThreadId so the sidebar chat does
 * not reset while the user is mid-navigation within the same project.
 */
export function mergeRouteAndStoreView(
  routeView: ViewState | null | undefined,
  storeView: ViewState | null,
): ViewState | null {
  if (!routeView) {
    return storeView;
  }

  if (!storeView) {
    return routeView;
  }

  // all-my-work spans every project, so there is no project id to merge against.
  if (routeView.type === "all-my-work" || storeView.type === "all-my-work") {
    return routeView;
  }

  if (routeView.projectId !== storeView.projectId) {
    return routeView;
  }

  return mergeEmbeddedThreadIdFromStore(routeView, storeView);
}

export { embeddedThreadIdFromParentView as embeddedThreadIdForDashboardModeSwitch };

type ProjectStore = ReturnType<typeof useProjectStore>;
type OnOpenDashboard =
  | ((
      projectId: string,
      dashboardMode?: ProjectDashboardMode,
      embeddedThreadId?: string | null,
    ) => void)
  | undefined;

/**
 * Sidebar dashboard-mode selection carries the current embedded thread through
 * to the route, so switching Backlog/My Work/… does not drop the thread the
 * user is conversing with.
 */
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
