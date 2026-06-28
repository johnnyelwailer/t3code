import { useMemo } from "react";

import { usePublishT3workDashboardRecipeViewSummary } from "~/t3work/t3work-dashboardRecipeViewContext";
import { buildBacklogRecipeViewSummary } from "~/t3work/t3work-dashboardRecipeSummary";
import { hasBacklogViewFiltersActive } from "~/t3work/t3work-dashboardRecipeFilterOutcomes";
import {
  buildProjectBacklogOwnershipGroups,
  buildProjectBacklogPlanningLanes,
  buildVisibleBacklogHierarchy,
} from "~/t3work/t3work-projectBacklogPresentation";
import {
  buildProjectBacklogAssigneeFilterOptions,
  compareProjectBacklogTickets,
  filterProjectBacklogTickets,
} from "~/t3work/t3work-projectBacklogUtils";
import type { ProjectTicket } from "~/t3work/t3work-types";

type BacklogFilterInput = Parameters<typeof filterProjectBacklogTickets>[0];

export function useProjectDashboardBacklogDerivedData(
  input: BacklogFilterInput & {
    currentUserDisplayName: string | undefined;
    searchTickets?: ReadonlyArray<ProjectTicket>;
  },
) {
  const {
    assigneeFilter,
    assigneeFilterScope,
    currentUserDisplayName,
    focusFilter,
    query,
    searchTickets,
    tickets,
    visibleIssueTypes,
  } = input;
  const derived = useMemo(() => {
    // Remote search hits matched server-side (Jira full-text or the offline
    // cache), so they bypass the client substring filter; they still go
    // through the focus/assignee filters via the empty-query pass below.
    const knownIds = new Set(tickets.map((ticket) => ticket.id));
    const extraSearchTickets = (searchTickets ?? []).filter((ticket) => !knownIds.has(ticket.id));
    const allTickets = extraSearchTickets.length ? [...tickets, ...extraSearchTickets] : tickets;

    const locallyFiltered = filterProjectBacklogTickets({
      tickets: allTickets,
      query,
      focusFilter,
      ...(assigneeFilter !== undefined ? { assigneeFilter } : {}),
      ...(assigneeFilterScope !== undefined ? { assigneeFilterScope } : {}),
      ...(visibleIssueTypes !== undefined ? { visibleIssueTypes } : {}),
    });
    let filteredTickets = locallyFiltered;
    if (query.trim() && extraSearchTickets.length) {
      const matchedIds = new Set(locallyFiltered.map((ticket) => ticket.id));
      const remoteOnlyMatches = filterProjectBacklogTickets({
        tickets: extraSearchTickets,
        query: "",
        focusFilter,
        ...(assigneeFilter !== undefined ? { assigneeFilter } : {}),
        ...(assigneeFilterScope !== undefined ? { assigneeFilterScope } : {}),
        ...(visibleIssueTypes !== undefined ? { visibleIssueTypes } : {}),
      }).filter((ticket) => !matchedIds.has(ticket.id));
      if (remoteOnlyMatches.length) {
        filteredTickets = [...locallyFiltered, ...remoteOnlyMatches].toSorted(
          compareProjectBacklogTickets,
        );
      }
    }
    return {
      filteredTickets,
      assigneeOptions: buildProjectBacklogAssigneeFilterOptions(tickets, currentUserDisplayName),
      hierarchyPresentation: buildVisibleBacklogHierarchy(allTickets, filteredTickets),
      planningLanes: buildProjectBacklogPlanningLanes(filteredTickets),
      ownershipGroups: buildProjectBacklogOwnershipGroups(filteredTickets),
      recipeViewSummary: {
        ...buildBacklogRecipeViewSummary(filteredTickets),
        viewFiltersActive: hasBacklogViewFiltersActive({
          query,
          focusFilter,
          assigneeFilter: assigneeFilter ?? "",
        }),
      },
    };
  }, [
    assigneeFilter,
    assigneeFilterScope,
    currentUserDisplayName,
    focusFilter,
    query,
    searchTickets,
    tickets,
    visibleIssueTypes,
  ]);

  usePublishT3workDashboardRecipeViewSummary(derived.recipeViewSummary);

  return derived;
}
