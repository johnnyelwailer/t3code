import {
  listT3TeamProjectSetupProfiles,
  resolveT3TeamProjectSetupProfileId,
  type T3TeamProjectSetupProfileId,
} from "~/t3team/t3team-projectSetup";
import type { ProjectTicket } from "~/t3team/t3team-types";
import type {
  ProjectTicketKanbanBoardColumn,
  ProjectTicketKanbanColumn,
  ProjectTicketKanbanColumnId,
  ProjectTicketKanbanColumns,
  ProjectTicketStatusCategory,
} from "~/t3team/t3team-projectTicketStatusTypes";
import {
  doneStatusKeywords,
  formatProjectTicketKanbanStatusTitle,
  inProgressStatusKeywords,
  includesStatusKeyword,
  normalizeProjectTicketStatus,
  requirementsEngineerOnlyStatusKeywords,
  reviewStatusKeywords,
  todoStatusKeywords,
} from "~/t3team/t3team-projectTicketStatusKeywords";

export type * from "~/t3team/t3team-projectTicketStatusTypes";

export function getProjectTicketKanbanColumnId(status: string): ProjectTicketKanbanColumnId {
  const normalizedStatus = normalizeProjectTicketStatus(status);
  return normalizedStatus.length > 0 ? normalizedStatus : "__no_status__";
}

export function isProjectTicketKanbanStatusVisibleForProfile(
  status: string,
  profileId?: string,
): boolean {
  const normalizedStatus = normalizeProjectTicketStatus(status);
  if (normalizedStatus.length === 0 || !profileId) return true;

  const resolvedProfileId = resolveT3TeamProjectSetupProfileId(profileId);
  const profile = listT3TeamProjectSetupProfiles().find(
    (candidate) => candidate.id === resolvedProfileId,
  );
  if ((profile?.defaultActionFamilies ?? []).includes("product")) {
    return true;
  }

  return !includesStatusKeyword(normalizedStatus, requirementsEngineerOnlyStatusKeywords);
}

export function getProjectTicketKanbanLane(
  status: string,
): "todo" | "inProgress" | "review" | "done" {
  const normalizedStatus = normalizeProjectTicketStatus(status);
  if (normalizedStatus.length === 0) return "todo";
  if (includesStatusKeyword(normalizedStatus, doneStatusKeywords)) return "done";
  if (includesStatusKeyword(normalizedStatus, reviewStatusKeywords)) return "review";
  if (includesStatusKeyword(normalizedStatus, todoStatusKeywords)) return "todo";
  return includesStatusKeyword(normalizedStatus, inProgressStatusKeywords) ? "inProgress" : "todo";
}

export function matchesProjectTicketStatusCategory(
  status: string,
  category: ProjectTicketStatusCategory,
): boolean {
  const lane = getProjectTicketKanbanLane(status);
  return category === "active" ? lane === "todo" || lane === "inProgress" : lane === category;
}

export function getProjectTicketKanbanLaneRank(status: string): number {
  switch (getProjectTicketKanbanLane(status)) {
    case "inProgress":
      return 0;
    case "review":
      return 1;
    case "todo":
      return 2;
    case "done":
      return 3;
  }
}

function buildProjectTicketKanbanConfiguredStatusOrder(
  boardColumns?: ReadonlyArray<ProjectTicketKanbanBoardColumn>,
): ReadonlyMap<string, number> {
  const configuredStatusOrder = new Map<string, number>();
  let nextOrder = 0;

  for (const column of boardColumns ?? []) {
    for (const status of column.statuses) {
      const normalizedStatus = normalizeProjectTicketStatus(status.name);
      if (normalizedStatus.length === 0 || configuredStatusOrder.has(normalizedStatus)) {
        continue;
      }
      configuredStatusOrder.set(normalizedStatus, nextOrder++);
    }
  }

  return configuredStatusOrder;
}

function seedProjectTicketKanbanColumnsFromBoard(input: {
  columnsById: Map<ProjectTicketKanbanColumnId, ProjectTicketKanbanColumn>;
  boardColumns?: ReadonlyArray<ProjectTicketKanbanBoardColumn> | undefined;
  profileId?: T3TeamProjectSetupProfileId | string | undefined;
}): void {
  for (const column of input.boardColumns ?? []) {
    for (const status of column.statuses) {
      if (!isProjectTicketKanbanStatusVisibleForProfile(status.name, input.profileId)) continue;
      const id = getProjectTicketKanbanColumnId(status.name);
      if (input.columnsById.has(id)) continue;

      input.columnsById.set(id, {
        id,
        title: formatProjectTicketKanbanStatusTitle(status.name),
        items: [],
      });
    }
  }
}

function isProjectTicketKanbanStatusVisibleOnBoard(
  status: string,
  configuredStatusOrder: ReadonlyMap<string, number>,
): boolean {
  return (
    configuredStatusOrder.size === 0 ||
    configuredStatusOrder.has(normalizeProjectTicketStatus(status))
  );
}

function getProjectTicketKanbanColumnOrder(
  status: string,
  configuredStatusOrder?: ReadonlyMap<string, number>,
): number {
  const normalizedStatus = normalizeProjectTicketStatus(status);
  const configuredOrder = normalizedStatus
    ? configuredStatusOrder?.get(normalizedStatus)
    : undefined;
  if (configuredOrder !== undefined) return configuredOrder;

  const fallbackBase = (configuredStatusOrder?.size ?? 0) + 100;
  switch (getProjectTicketKanbanLane(status)) {
    case "todo":
      return fallbackBase + 0;
    case "inProgress":
      return fallbackBase + 1;
    case "review":
      return fallbackBase + 2;
    case "done":
      return fallbackBase + 3;
  }
}

function compareProjectTicketKanbanColumns(
  left: ProjectTicketKanbanColumn,
  right: ProjectTicketKanbanColumn,
  configuredStatusOrder: ReadonlyMap<string, number>,
): number {
  if (configuredStatusOrder.size === 0) {
    const occupancyDifference = Number(right.items.length > 0) - Number(left.items.length > 0);
    if (occupancyDifference !== 0) return occupancyDifference;
  }

  const orderDifference =
    getProjectTicketKanbanColumnOrder(left.title, configuredStatusOrder) -
    getProjectTicketKanbanColumnOrder(right.title, configuredStatusOrder);
  return orderDifference !== 0 ? orderDifference : left.title.localeCompare(right.title);
}

export function buildProjectTicketKanbanColumns(
  tickets: readonly ProjectTicket[],
  options?: {
    profileId?: T3TeamProjectSetupProfileId | string;
    availableStatuses?: ReadonlyArray<ProjectTicketKanbanBoardColumn["statuses"][number]>;
    boardColumns?: ReadonlyArray<ProjectTicketKanbanBoardColumn>;
  },
): ProjectTicketKanbanColumns {
  const columnsById = new Map<ProjectTicketKanbanColumnId, ProjectTicketKanbanColumn>();
  const configuredStatusOrder = buildProjectTicketKanbanConfiguredStatusOrder(
    options?.boardColumns,
  );

  seedProjectTicketKanbanColumnsFromBoard({
    columnsById,
    boardColumns: options?.boardColumns,
    profileId: options?.profileId,
  });

  for (const status of options?.availableStatuses ?? []) {
    if (!isProjectTicketKanbanStatusVisibleForProfile(status.name, options?.profileId)) continue;
    const id = getProjectTicketKanbanColumnId(status.name);
    if (!columnsById.has(id)) {
      columnsById.set(id, {
        id,
        title: formatProjectTicketKanbanStatusTitle(status.name),
        items: [],
      });
    }
  }

  for (const ticket of tickets) {
    if (!isProjectTicketKanbanStatusVisibleForProfile(ticket.status, options?.profileId)) continue;
    if (!isProjectTicketKanbanStatusVisibleOnBoard(ticket.status, configuredStatusOrder)) continue;

    const id = getProjectTicketKanbanColumnId(ticket.status);
    const existingColumn = columnsById.get(id);
    if (existingColumn) {
      existingColumn.items.push(ticket);
      continue;
    }

    columnsById.set(id, {
      id,
      title: formatProjectTicketKanbanStatusTitle(ticket.status),
      items: [ticket],
    });
  }

  return [...columnsById.values()].toSorted((left, right) =>
    compareProjectTicketKanbanColumns(left, right, configuredStatusOrder),
  );
}
