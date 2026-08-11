import { normalizeHiddenKanbanColumnIds } from "~/t3team/hooks/t3team-projectKanbanDerivedData";
import type {
  ProjectMyWorkKanbanLaneOption,
  ProjectMyWorkStatusCategory,
} from "~/t3team/t3team-projectMyWork";
import type { ProjectTicketKanbanBoardColumn } from "~/t3team/t3team-projectTicketStatus";
import { matchesProjectTicketStatusCategory } from "~/t3team/t3team-projectTicketStatus";
import type { ProjectTicket } from "~/t3team/t3team-types";

export function hasProjectMyWorkDisplayNameDependentAssignments(
  tickets: readonly ProjectTicket[],
  accountId?: string,
): boolean {
  const normalizedAccountId = accountId?.trim();

  return tickets.some((ticket) => {
    if (!ticket.assignee?.trim()) {
      return false;
    }

    return ticket.assigneeAccountId?.trim() !== normalizedAccountId;
  });
}

export function buildDistinctOptions(values: ReadonlyArray<string | undefined>): string[] {
  const distinct = new Set<string>();

  for (const value of values) {
    const nextValue = value?.trim();
    if (nextValue) {
      distinct.add(nextValue);
    }
  }

  return [...distinct].toSorted((left, right) => left.localeCompare(right));
}

export function buildProjectMyWorkStatusOptions(
  availableStatuses: ReadonlyArray<ProjectTicketKanbanBoardColumn["statuses"][number]>,
  tickets: readonly ProjectTicket[],
): string[] {
  return buildDistinctOptions(
    availableStatuses.length > 0
      ? availableStatuses.map((status) => status.name)
      : tickets.map((ticket) => ticket.status),
  );
}

export function buildProjectMyWorkAutoHiddenKanbanColumnIds(
  kanbanLaneOptions: ReadonlyArray<ProjectMyWorkKanbanLaneOption>,
): string[] {
  if (!kanbanLaneOptions.some((option) => option.count > 0)) {
    return [];
  }

  return kanbanLaneOptions
    .filter((option) => option.count === 0)
    .map((option) => option.id)
    .toSorted();
}

export function resolveProjectMyWorkHiddenKanbanColumnIds(input: {
  hiddenKanbanColumnIds: ReadonlyArray<string>;
  hasCustomizedKanbanLanes: boolean;
  kanbanLaneOptions: ReadonlyArray<ProjectMyWorkKanbanLaneOption>;
}): string[] {
  return normalizeHiddenKanbanColumnIds(
    input.hasCustomizedKanbanLanes
      ? input.hiddenKanbanColumnIds
      : buildProjectMyWorkAutoHiddenKanbanColumnIds(input.kanbanLaneOptions),
    input.kanbanLaneOptions,
  );
}

export function setSortedStringMembership(
  values: ReadonlyArray<string>,
  value: string,
  present: boolean,
): string[] {
  const next = new Set(values);
  if (present) next.add(value);
  else next.delete(value);
  return [...next].toSorted();
}

export function countMatchingStatusCategory(
  tickets: readonly ProjectTicket[],
  category: "active" | "review" | "done",
) {
  return tickets.filter((ticket) => matchesProjectTicketStatusCategory(ticket.status, category))
    .length;
}

export function countProjectMyWorkActiveOptions(input: {
  statusCategory: ProjectMyWorkStatusCategory | "all";
  selectedPriority: string;
  selectedStatus: string;
  hasCustomizedKanbanLanes: boolean;
  hiddenKanbanColumnIds: ReadonlyArray<string>;
  excludedTypeKeys: ReadonlyArray<string>;
}): number {
  return (
    Number(input.statusCategory !== "all") +
    Number(input.selectedPriority !== "all") +
    Number(input.selectedStatus !== "all") +
    (input.hasCustomizedKanbanLanes ? input.hiddenKanbanColumnIds.length : 0) +
    input.excludedTypeKeys.length
  );
}

export function buildProjectMyWorkMetrics(tickets: readonly ProjectTicket[]) {
  return {
    total: tickets.length,
    active: countMatchingStatusCategory(tickets, "active"),
    review: countMatchingStatusCategory(tickets, "review"),
    done: countMatchingStatusCategory(tickets, "done"),
  };
}

export function shouldShowProjectMyWorkLoadingState(input: {
  resourcesLoading: boolean;
  ticketCount: number;
  currentUserDisplayNameLoading: boolean;
  hasDisplayNameDependentAssignments: boolean;
  assignedWorkItemsCount: number;
}): boolean {
  return (
    (input.resourcesLoading && input.ticketCount === 0) ||
    (input.currentUserDisplayNameLoading &&
      input.hasDisplayNameDependentAssignments &&
      input.ticketCount > 0 &&
      input.assignedWorkItemsCount === 0)
  );
}
