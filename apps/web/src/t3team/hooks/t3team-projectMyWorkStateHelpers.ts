import { normalizeHiddenKanbanColumnIds } from "~/t3team/hooks/t3team-projectKanbanDerivedData";
import type {
  ProjectMyWorkIdentity,
  ProjectMyWorkKanbanLaneOption,
  ProjectMyWorkStatusCategory,
} from "~/t3team/t3team-projectMyWork";
import type { ProjectMyWorkLoadStatus } from "~/t3team/t3team-projectMyWorkContentState";
import type { ProjectMyWorkLens } from "~/t3team/t3team-ProjectMyWorkViewSwitch";
import type { ProjectDashboardMyWorkState } from "~/t3team/t3team-projectDashboardMyWorkState";
import type { ProjectTicketKanbanBoardColumn } from "~/t3team/t3team-projectTicketStatus";
import { matchesProjectTicketStatusCategory } from "~/t3team/t3team-projectTicketStatus";
import type { ProjectTicket } from "~/t3team/t3team-types";

/**
 * Who "me" is for matching tickets. `project.source.accountId` is the Jira *site* id and can never
 * equal a ticket's `assigneeAccountId`; the Jira user id comes from the server-scoped My Work page.
 * Display name is only a fallback.
 */
export function buildProjectMyWorkIdentity(
  viewerAccountId: string | undefined,
  displayName: string | undefined,
): ProjectMyWorkIdentity {
  return {
    ...(viewerAccountId ? { accountId: viewerAccountId } : {}),
    ...(displayName ? { displayName } : {}),
  };
}

/**
 * True when at least one assigned ticket can only be matched to the viewer by
 * display name — i.e. its `assigneeAccountId` is not the viewer's Jira user id.
 * `viewerAccountId` is the Jira *user* id from the My Work page, never the
 * Jira site id (`project.source.accountId`).
 */
export function hasProjectMyWorkDisplayNameDependentAssignments(
  tickets: readonly ProjectTicket[],
  viewerAccountId?: string,
): boolean {
  const normalizedAccountId = viewerAccountId?.trim();

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

/** State patch applied by "Reset" in the My Work options menu. */
export const PROJECT_MY_WORK_RESET_OPTIONS_PATCH: Partial<ProjectDashboardMyWorkState> = {
  statusCategory: "all",
  hiddenKanbanColumnIds: [],
  hasCustomizedKanbanLanes: false,
  excludedTypeKeys: [],
  selectedPriority: "all",
  selectedStatus: "all",
};

/** Hidden lanes only exist on the board, so other lenses do not count them as an active option. */
export function countProjectMyWorkActiveOptions(input: {
  lens: ProjectMyWorkLens;
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
    (input.lens === "board" && input.hasCustomizedKanbanLanes
      ? input.hiddenKanbanColumnIds.length
      : 0) +
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

/** Linked project whose first My Work response has neither arrived nor failed. */
export function isAwaitingFirstProjectMyWorkLoad(
  status: ProjectMyWorkLoadStatus,
  lastCheckedAt: number | undefined,
): boolean {
  return (
    Boolean(status.isLinked) &&
    lastCheckedAt === undefined &&
    !status.loadError &&
    !status.sessionExpired
  );
}

export function shouldShowProjectMyWorkLoadingState(input: {
  resourcesLoading: boolean;
  /** Linked project whose first My Work response has neither arrived nor failed yet. */
  awaitingFirstLoad?: boolean;
  ticketCount: number;
  currentUserDisplayNameLoading: boolean;
  hasDisplayNameDependentAssignments: boolean;
  assignedWorkItemsCount: number;
}): boolean {
  return (
    (input.resourcesLoading && input.ticketCount === 0) ||
    input.awaitingFirstLoad === true ||
    (input.currentUserDisplayNameLoading &&
      input.hasDisplayNameDependentAssignments &&
      input.ticketCount > 0 &&
      input.assignedWorkItemsCount === 0)
  );
}
