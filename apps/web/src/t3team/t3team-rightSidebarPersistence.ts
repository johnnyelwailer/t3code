import type { ProjectDashboardMode } from "~/t3team/t3team-projectDashboardModeState";

const RIGHT_SIDEBAR_ROOT_INSTANCE_SEGMENT = "__root__";

function encodeSidebarInstanceSegment(value: string | null | undefined): string {
  return value && value.length > 0 ? value : RIGHT_SIDEBAR_ROOT_INSTANCE_SEGMENT;
}

export function getProjectDashboardRightSidebarCollapsedStorageKey(input: {
  projectId: string;
  dashboardMode: ProjectDashboardMode;
  embeddedThreadId?: string | null;
}): string {
  return [
    "t3team:right-sidebar:dashboard:v1",
    input.projectId,
    input.dashboardMode,
    encodeSidebarInstanceSegment(input.embeddedThreadId),
  ].join(":");
}

export function getTicketRightSidebarCollapsedStorageKey(input: {
  projectId: string;
  ticketId: string;
  embeddedThreadId?: string | null;
}): string {
  return [
    "t3team:right-sidebar:ticket:v1",
    input.projectId,
    input.ticketId,
    encodeSidebarInstanceSegment(input.embeddedThreadId),
  ].join(":");
}
