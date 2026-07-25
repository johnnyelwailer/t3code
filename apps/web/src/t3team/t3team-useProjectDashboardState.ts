import { useMemo, useState } from "react";
import type { ProjectShellProject } from "@t3tools/project-context";
import { readProjectSetupProfileIdFromProject } from "~/t3team/hooks/t3team-createProjectBootstrap";
import { useProjectKanbanBoardColumns } from "~/t3team/hooks/t3team-useProjectKanbanBoardColumns";
import { useProjectResources } from "~/t3team/hooks/t3team-useProjectResources";
import {
  buildProjectTicketKanbanColumns,
  getProjectTicketKanbanLaneRank,
  matchesProjectTicketStatusCategory,
} from "~/t3team/t3team-projectTicketStatus";
import { buildProjectTicketHierarchy } from "~/t3team/t3team-ticketHierarchy";
import type { ProjectTicket } from "~/t3team/t3team-types";

export function useProjectDashboardState({
  project,
  fallbackTickets,
}: {
  project: ProjectShellProject;
  fallbackTickets: ProjectTicket[];
}) {
  const { tickets: fetchedTickets, lastCheckedAt } = useProjectResources(project);
  const { boardColumns } = useProjectKanbanBoardColumns(project);
  const tickets = fetchedTickets.length > 0 ? fetchedTickets : fallbackTickets;
  const kanbanProfileId = useMemo(() => readProjectSetupProfileIdFromProject(project), [project]);

  const openTickets = tickets.filter((ticket) =>
    matchesProjectTicketStatusCategory(ticket.status, "active"),
  );
  const inReviewTickets = tickets.filter((ticket) =>
    matchesProjectTicketStatusCategory(ticket.status, "review"),
  );
  const doneTickets = tickets.filter((ticket) =>
    matchesProjectTicketStatusCategory(ticket.status, "done"),
  );

  const workItems = useMemo(() => {
    return tickets.toSorted((a, b) => {
      const byStatus =
        getProjectTicketKanbanLaneRank(a.status) - getProjectTicketKanbanLaneRank(b.status);
      if (byStatus !== 0) return byStatus;
      return a.ref.displayId.localeCompare(b.ref.displayId, undefined, { numeric: true });
    });
  }, [tickets]);

  const [query, setQuery] = useState("");
  const [statusCategory, setStatusCategory] = useState<"all" | "active" | "review" | "done">("all");
  const [selectedType, setSelectedType] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [selectedPriority, setSelectedPriority] = useState("all");
  const [viewMode, setViewMode] = useState<"grid" | "list" | "kanban">("grid");
  const [groupMode, setGroupMode] = useState<"flat" | "parent-child">("parent-child");
  const [showJiraItems, setShowJiraItems] = useState(true);
  const [showGitHubActivity, setShowGitHubActivity] = useState(true);
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false);

  const typeOptions = useMemo(() => {
    const values = new Set<string>();
    for (const ticket of tickets) {
      const value = ticket.issueType ?? ticket.ref.type;
      if (value && value.trim().length > 0) values.add(value);
    }
    return [...values].toSorted((a, b) => a.localeCompare(b));
  }, [tickets]);

  const statusOptions = useMemo(() => {
    const values = new Set<string>();
    for (const ticket of tickets) {
      if (ticket.status.trim().length > 0) values.add(ticket.status);
    }
    return [...values].toSorted((a, b) => a.localeCompare(b));
  }, [tickets]);

  const priorityOptions = useMemo(() => {
    const values = new Set<string>();
    for (const ticket of tickets) {
      if (ticket.priority && ticket.priority.trim().length > 0) values.add(ticket.priority);
    }
    return [...values].toSorted((a, b) => a.localeCompare(b));
  }, [tickets]);

  const filteredWorkItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return workItems.filter((ticket) => {
      if (statusCategory !== "all") {
        if (!matchesProjectTicketStatusCategory(ticket.status, statusCategory)) return false;
      }

      if (selectedType !== "all") {
        const issueType = ticket.issueType ?? ticket.ref.type ?? "";
        if (issueType !== selectedType) return false;
      }
      if (selectedStatus !== "all" && ticket.status !== selectedStatus) return false;
      if (selectedPriority !== "all" && ticket.priority !== selectedPriority) return false;

      if (!normalizedQuery) return true;
      const haystack = [
        ticket.ref.displayId,
        ticket.ref.title,
        ticket.status,
        ticket.priority ?? "",
        ticket.assignee ?? "",
        ticket.issueType ?? ticket.ref.type ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [query, selectedPriority, selectedStatus, selectedType, statusCategory, workItems]);

  const kanbanColumns = useMemo(() => {
    return buildProjectTicketKanbanColumns(filteredWorkItems, {
      profileId: kanbanProfileId,
      boardColumns,
    });
  }, [boardColumns, filteredWorkItems, kanbanProfileId]);

  const parentChildGroups = useMemo(
    () => buildProjectTicketHierarchy(filteredWorkItems),
    [filteredWorkItems],
  );
  const isHierarchyMode = groupMode === "parent-child";
  const activeAdvancedFilterCount =
    Number(selectedType !== "all") +
    Number(selectedPriority !== "all") +
    Number(selectedStatus !== "all");

  const resetAdvancedFilters = () => {
    setSelectedType("all");
    setSelectedPriority("all");
    setSelectedStatus("all");
  };

  return {
    tickets,
    jiraLastCheckedAt: lastCheckedAt,
    openTickets,
    inReviewTickets,
    doneTickets,
    query,
    setQuery,
    viewMode,
    setViewMode,
    groupMode,
    setGroupMode,
    showJiraItems,
    setShowJiraItems,
    showGitHubActivity,
    setShowGitHubActivity,
    statusCategory,
    setStatusCategory,
    advancedFiltersOpen,
    setAdvancedFiltersOpen,
    activeAdvancedFilterCount,
    selectedType,
    setSelectedType,
    typeOptions,
    selectedPriority,
    setSelectedPriority,
    priorityOptions,
    selectedStatus,
    setSelectedStatus,
    statusOptions,
    resetAdvancedFilters,
    filteredWorkItems,
    isHierarchyMode,
    kanbanColumns,
    parentChildGroups,
  };
}
