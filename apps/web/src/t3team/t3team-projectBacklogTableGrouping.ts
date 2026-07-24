import type {
  ProjectBacklogPlanningState,
  ProjectBacklogTicketContext,
} from "./t3team-projectBacklogPresentation";
import {
  getProjectBacklogPlanningMeta,
  getProjectBacklogPlanningState,
} from "./t3team-projectBacklogPresentation";
import { getProjectTicketIssueTypeKey } from "./t3team-projectBacklogUtils";
import {
  projectBacklogTablePlanningStateOrder,
  type ProjectBacklogTableGroupBy,
} from "./t3team-projectBacklogTableMeta";
import type { ProjectTicket } from "./t3team-types";

export type ProjectBacklogTableGroupDescriptor = {
  id: string;
  label: string;
  description?: string;
  order: number;
};

function getDirectParent(context?: ProjectBacklogTicketContext): ProjectTicket | undefined {
  const ancestors = context?.ancestors;
  return ancestors && ancestors.length > 0 ? ancestors[ancestors.length - 1] : undefined;
}

function getEpicPreferredParent(context?: ProjectBacklogTicketContext): ProjectTicket | undefined {
  const ancestors = context?.ancestors;
  if (!ancestors || ancestors.length === 0) {
    return undefined;
  }

  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const candidate = ancestors[index];
    if (candidate && getProjectTicketIssueTypeKey(candidate).includes("epic")) {
      return candidate;
    }
  }

  return ancestors[ancestors.length - 1];
}

function getSprintStateRank(state: string | undefined): number {
  switch (state?.toLowerCase()) {
    case "active":
      return 0;
    case "future":
      return 1;
    case "closed":
      return 2;
    default:
      return 3;
  }
}

function getSprintOrder(ticket: ProjectTicket): number {
  if (!ticket.sprintName) {
    return 99_000_000_000_000;
  }

  const timestamp = Date.parse(
    ticket.sprintStartDate ?? ticket.sprintEndDate ?? ticket.sprintCompleteDate ?? "",
  );
  const safeTimestamp = Number.isNaN(timestamp) ? 0 : timestamp;
  return getSprintStateRank(ticket.sprintState) * 10_000_000_000_000 - safeTimestamp;
}

export function compareProjectBacklogTableGroupLabels(left: string, right: string): number {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

export function getProjectBacklogTableGroupDescriptor(
  ticket: ProjectTicket,
  groupBy: ProjectBacklogTableGroupBy,
  context?: ProjectBacklogTicketContext,
): ProjectBacklogTableGroupDescriptor {
  if (groupBy === "none") {
    return {
      id: "all",
      label: "All issues",
      order: 0,
    };
  }

  if (groupBy === "planning-state") {
    const state = getProjectBacklogPlanningState(ticket);
    const meta = getProjectBacklogPlanningMeta(state);
    return {
      id: state,
      label: meta.label,
      description: meta.description,
      order: projectBacklogTablePlanningStateOrder[state as ProjectBacklogPlanningState],
    };
  }

  if (groupBy === "sprint") {
    return ticket.sprintName
      ? {
          id: `sprint:${ticket.sprintId ?? ticket.sprintName}`,
          label: ticket.sprintName,
          ...(ticket.sprintState ? { description: ticket.sprintState } : {}),
          order: getSprintOrder(ticket),
        }
      : {
          id: "sprint:none",
          label: "No sprint",
          order: getSprintOrder(ticket),
        };
  }

  if (groupBy === "assignee") {
    return {
      id: `assignee:${ticket.assignee?.trim() || "unassigned"}`,
      label: ticket.assignee?.trim() || "Unassigned",
      order: ticket.assignee?.trim() ? 0 : -1,
    };
  }

  if (groupBy === "status") {
    return { id: `status:${ticket.status}`, label: ticket.status, order: 0 };
  }

  if (groupBy === "issue-type") {
    return {
      id: `type:${ticket.issueType ?? ticket.ref.type ?? "unknown"}`,
      label: ticket.issueType ?? ticket.ref.type ?? "Unknown type",
      order: 0,
    };
  }

  const parent = getEpicPreferredParent(context) ?? getDirectParent(context);
  return parent
    ? {
        id: `parent:${parent.id}`,
        label: parent.ref.displayId,
        description: parent.ref.title,
        order: 0,
      }
    : { id: "parent:none", label: "Top-level issues", order: -1 };
}
