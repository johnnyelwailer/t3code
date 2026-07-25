import type {
  ProjectBacklogAssigneeFilterScopeKey,
  ProjectBacklogIssueTypeFilterKey,
} from "~/t3team/t3team-projectBacklogFilterOptions";
import type { ProjectTicket } from "~/t3team/t3team-types";

export function hasProjectBacklogAssignee(ticket: ProjectTicket): boolean {
  return Boolean(ticket.assigneeAccountId ?? ticket.assignee);
}

export function hasProjectBacklogEstimate(ticket: ProjectTicket): boolean {
  return typeof ticket.estimateValue === "number";
}

export function getProjectTicketIssueTypeKey(ticket: ProjectTicket): string {
  return (ticket.issueType ?? ticket.ref.type ?? "").trim().toLowerCase();
}

export function isProjectTicketSubtask(ticket: ProjectTicket): boolean {
  if (ticket.issueTypeIsSubtask === true) {
    return true;
  }

  const issueType = getProjectTicketIssueTypeKey(ticket);
  return issueType.includes("subtask") || issueType.includes("sub-task");
}

export function isProjectTicketEpic(ticket: ProjectTicket): boolean {
  return getProjectTicketIssueTypeKey(ticket).includes("epic");
}

export function getProjectBacklogAssigneeFilterCategory(
  ticket: ProjectTicket,
): ProjectBacklogAssigneeFilterScopeKey {
  if (isProjectTicketEpic(ticket)) {
    return "epic";
  }
  if (isProjectTicketSubtask(ticket)) {
    return "subtask";
  }
  return "story";
}

export function getProjectBacklogIssueTypeFilterCategory(
  ticket: ProjectTicket,
): ProjectBacklogIssueTypeFilterKey {
  if (isProjectTicketEpic(ticket)) {
    return "epic";
  }
  if (isProjectTicketSubtask(ticket)) {
    return "subtask";
  }
  return "standard";
}

export function isProjectTicketHourTracked(ticket: ProjectTicket): boolean {
  const issueType = getProjectTicketIssueTypeKey(ticket);
  if (issueType.length > 0) {
    if (issueType.includes("story")) {
      return false;
    }
    return isProjectTicketSubtask(ticket);
  }

  if (
    ticket.timeOriginalEstimateSeconds !== undefined ||
    ticket.timeRemainingEstimateSeconds !== undefined ||
    ticket.aggregateTimeOriginalEstimateSeconds !== undefined ||
    ticket.aggregateTimeRemainingEstimateSeconds !== undefined
  ) {
    return true;
  }

  return false;
}
