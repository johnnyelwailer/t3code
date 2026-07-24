import type { ProjectDashboardMode } from "~/t3team/t3team-projectDashboardModeState";
import type { ProjectThread, ProjectThreadDisplayMode, ViewState } from "~/t3team/t3team-types";

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
