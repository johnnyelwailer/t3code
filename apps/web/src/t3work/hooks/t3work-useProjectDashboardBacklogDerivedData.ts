import { useMemo } from "react";

import { usePublishT3workDashboardRecipeViewSummary } from "~/t3work/t3work-dashboardRecipeViewContext";
import { buildBacklogRecipeViewSummary } from "~/t3work/t3work-dashboardRecipeSummary";
import {
  buildProjectBacklogOwnershipGroups,
  buildProjectBacklogPlanningLanes,
  buildVisibleBacklogHierarchy,
} from "~/t3work/t3work-projectBacklogPresentation";
import {
  buildProjectBacklogAssigneeFilterOptions,
  filterProjectBacklogTickets,
} from "~/t3work/t3work-projectBacklogUtils";

type BacklogFilterInput = Parameters<typeof filterProjectBacklogTickets>[0];

export function useProjectDashboardBacklogDerivedData(
  input: BacklogFilterInput & { currentUserDisplayName: string | undefined },
) {
  const { assigneeFilter, currentUserDisplayName, focusFilter, query, tickets } = input;
  const derived = useMemo(() => {
    const filteredTickets = filterProjectBacklogTickets({
      tickets,
      query,
      focusFilter,
      ...(assigneeFilter !== undefined ? { assigneeFilter } : {}),
    });
    const bugTickets = filteredTickets.filter(
      (ticket) => (ticket.issueType ?? ticket.ref.type ?? "").toLowerCase() === "bug",
    );

    return {
      filteredTickets,
      assigneeOptions: buildProjectBacklogAssigneeFilterOptions(tickets, currentUserDisplayName),
      hierarchyPresentation: buildVisibleBacklogHierarchy(tickets, filteredTickets),
      planningLanes: buildProjectBacklogPlanningLanes(filteredTickets),
      ownershipGroups: buildProjectBacklogOwnershipGroups(filteredTickets),
      recipeViewSummary: buildBacklogRecipeViewSummary(filteredTickets),
    };
  }, [assigneeFilter, currentUserDisplayName, focusFilter, query, tickets]);

  usePublishT3workDashboardRecipeViewSummary(derived.recipeViewSummary);

  return derived;
}
