const RIGHT_SIDEBAR_ROOT_INSTANCE_SEGMENT = "__root__";

function encodeSidebarInstanceSegment(value: string | null | undefined): string {
  return value && value.length > 0 ? value : RIGHT_SIDEBAR_ROOT_INSTANCE_SEGMENT;
}

/**
 * One collapsed flag per project: hiding the aside is a choice about the dashboard, so it holds
 * across modes and threads instead of springing back open on every switch.
 */
export function getProjectDashboardRightSidebarCollapsedStorageKey(input: {
  projectId: string;
}): string {
  return ["t3team:right-sidebar:dashboard:v2", input.projectId].join(":");
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
