import type { ProjectBacklogTicketContext } from "./t3team-projectBacklogPresentation";
import { getProjectTicketIssueTypeKey } from "./t3team-projectBacklogUtils";
import type { ProjectTicketHierarchy } from "./t3team-ticketHierarchy";
import type { ProjectTicket } from "./t3team-types";

export type ProjectMyWorkIdentity = {
  readonly accountId?: string;
  readonly displayName?: string;
};

export type ProjectMyWorkStatusCategory = "all" | "active" | "review" | "done";

export type ProjectMyWorkTypeOption = {
  readonly key: string;
  readonly label: string;
};

export type ProjectMyWorkKanbanLaneOption = {
  readonly id: string;
  readonly title: string;
  readonly count: number;
};

export type ProjectMyWorkHierarchyRow = {
  readonly ticket: ProjectTicket;
  readonly depth: number;
  readonly isContextOnly: boolean;
};

export type ProjectMyWorkVisibleHierarchy = {
  readonly visibleTickets: readonly ProjectTicket[];
  readonly hierarchy: ProjectTicketHierarchy;
  readonly contextByTicketId: ReadonlyMap<string, ProjectBacklogTicketContext>;
  readonly matchedTicketIds: ReadonlySet<string>;
  readonly rows: readonly ProjectMyWorkHierarchyRow[];
};

function normalizeValue(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLocaleLowerCase();
  return normalized && normalized.length > 0 ? normalized : undefined;
}

export function isProjectMyWorkTicket(
  ticket: ProjectTicket,
  identity: ProjectMyWorkIdentity,
): boolean {
  const accountId = identity.accountId?.trim();
  if (accountId && ticket.assigneeAccountId?.trim() === accountId) {
    return true;
  }

  const normalizedAssignee = normalizeValue(ticket.assignee);
  const normalizedDisplayName = normalizeValue(identity.displayName);
  return normalizedAssignee !== undefined && normalizedAssignee === normalizedDisplayName;
}

export function isProjectMyWorkEpic(ticket: ProjectTicket): boolean {
  return getProjectTicketIssueTypeKey(ticket).includes("epic");
}

export function getProjectMyWorkDisplayReason(isContextOnly: boolean): string {
  return isContextOnly ? "Parent context" : "Assigned to you";
}
