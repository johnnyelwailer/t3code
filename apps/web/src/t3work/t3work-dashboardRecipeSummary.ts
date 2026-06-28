import {
  hasProjectBacklogAssignee,
  hasProjectBacklogEstimate,
} from "~/t3work/t3work-projectBacklogUtils";
import { matchesProjectTicketStatusCategory } from "~/t3work/t3work-projectTicketStatus";
import type { ProjectTicket } from "~/t3work/t3work-types";

export type T3workDashboardNeedsMyActionPreset =
  | "unassigned"
  | "needs-plan"
  | "with-subtasks"
  | "review"
  | "active";

export type T3workDashboardRecipeCurrentViewSummary = {
  readonly itemCount: number;
  readonly bugCount?: number;
  readonly primaryItemLabel?: string;
  readonly primaryBugLabel?: string;
  readonly needsMyActionPreset?: T3workDashboardNeedsMyActionPreset;
  readonly needsMyActionCount?: number;
  readonly viewFiltersActive?: boolean;
};

function buildBaseRecipeViewSummary(
  tickets: ReadonlyArray<ProjectTicket>,
): Omit<T3workDashboardRecipeCurrentViewSummary, "needsMyActionPreset" | "needsMyActionCount"> {
  const bugTickets = tickets.filter(
    (ticket) => (ticket.issueType ?? ticket.ref.type ?? "").toLowerCase() === "bug",
  );

  return {
    itemCount: tickets.length,
    bugCount: bugTickets.length,
    ...(tickets[0] ? { primaryItemLabel: tickets[0].ref.displayId } : {}),
    ...(bugTickets[0] ? { primaryBugLabel: bugTickets[0].ref.displayId } : {}),
  };
}

export function resolveBacklogNeedsMyActionPreset(
  tickets: ReadonlyArray<ProjectTicket>,
):
  | Extract<T3workDashboardNeedsMyActionPreset, "unassigned" | "needs-plan" | "with-subtasks">
  | undefined {
  if (tickets.some((ticket) => !hasProjectBacklogAssignee(ticket))) {
    return "unassigned";
  }

  if (tickets.some((ticket) => !hasProjectBacklogEstimate(ticket))) {
    return "needs-plan";
  }

  if (tickets.some((ticket) => (ticket.subtaskCount ?? 0) > 0)) {
    return "with-subtasks";
  }

  return undefined;
}

export function resolveMyWorkNeedsMyActionPreset(
  tickets: ReadonlyArray<ProjectTicket>,
): Extract<T3workDashboardNeedsMyActionPreset, "review" | "active"> | undefined {
  if (tickets.some((ticket) => matchesProjectTicketStatusCategory(ticket.status, "review"))) {
    return "review";
  }

  if (tickets.some((ticket) => matchesProjectTicketStatusCategory(ticket.status, "active"))) {
    return "active";
  }

  return undefined;
}

function countBacklogNeedsMyActionTickets(
  tickets: ReadonlyArray<ProjectTicket>,
  preset: Extract<
    T3workDashboardNeedsMyActionPreset,
    "unassigned" | "needs-plan" | "with-subtasks"
  >,
): number {
  switch (preset) {
    case "unassigned":
      return tickets.filter((ticket) => !hasProjectBacklogAssignee(ticket)).length;
    case "needs-plan":
      return tickets.filter((ticket) => !hasProjectBacklogEstimate(ticket)).length;
    case "with-subtasks":
      return tickets.filter((ticket) => (ticket.subtaskCount ?? 0) > 0).length;
  }
}

function countMyWorkNeedsMyActionTickets(
  tickets: ReadonlyArray<ProjectTicket>,
  preset: Extract<T3workDashboardNeedsMyActionPreset, "review" | "active">,
): number {
  return tickets.filter((ticket) => matchesProjectTicketStatusCategory(ticket.status, preset))
    .length;
}

export function buildBacklogRecipeViewSummary(
  tickets: ReadonlyArray<ProjectTicket>,
): T3workDashboardRecipeCurrentViewSummary {
  const preset = resolveBacklogNeedsMyActionPreset(tickets);

  return {
    ...buildBaseRecipeViewSummary(tickets),
    ...(preset
      ? {
          needsMyActionPreset: preset,
          needsMyActionCount: countBacklogNeedsMyActionTickets(tickets, preset),
        }
      : {}),
  };
}

export function buildMyWorkRecipeViewSummary(
  tickets: ReadonlyArray<ProjectTicket>,
): T3workDashboardRecipeCurrentViewSummary {
  const preset = resolveMyWorkNeedsMyActionPreset(tickets);

  return {
    ...buildBaseRecipeViewSummary(tickets),
    ...(preset
      ? {
          needsMyActionPreset: preset,
          needsMyActionCount: countMyWorkNeedsMyActionTickets(tickets, preset),
        }
      : {}),
  };
}
