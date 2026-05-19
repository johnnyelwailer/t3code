import { useMemo, useState } from "react";
import type { ProjectShellProject } from "@t3tools/project-context";
import { useProjectResources } from "~/t3work/hooks/t3work-useProjectResources";
import { buildProjectTicketHierarchy } from "~/t3work/t3work-ticketHierarchy";
import type { ProjectTicket } from "~/t3work/t3work-types";

export function useProjectDashboardState({
  project,
  fallbackTickets,
}: {
  project: ProjectShellProject;
  fallbackTickets: ProjectTicket[];
}) {
  const { tickets: fetchedTickets } = useProjectResources(project);
  const tickets = fetchedTickets.length > 0 ? fetchedTickets : fallbackTickets;

  const openTickets = tickets.filter(
    (ticket) =>
      ticket.status === "Open" ||
      ticket.status === "In Progress" ||
      ticket.status === "To Do" ||
      ticket.status === "In Development",
  );
  const inReviewTickets = tickets.filter(
    (ticket) =>
      ticket.status === "In Review" || ticket.status === "In QA" || ticket.status === "Review",
  );
  const doneTickets = tickets.filter(
    (ticket) =>
      ticket.status === "Done" || ticket.status === "Closed" || ticket.status === "Resolved",
  );

  const workItems = useMemo(() => {
    const statusRank = (status: string): number => {
      if (status === "In Progress" || status === "In Development") return 0;
      if (status === "In Review" || status === "In QA" || status === "Review") return 1;
      if (status === "Open" || status === "To Do") return 2;
      if (status === "Done" || status === "Resolved" || status === "Closed") return 3;
      return 4;
    };

    return tickets.toSorted((a, b) => {
      const byStatus = statusRank(a.status) - statusRank(b.status);
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
        const normalizedStatus = ticket.status.toLowerCase();
        const matchesCategory =
          statusCategory === "active"
            ? normalizedStatus === "open" ||
              normalizedStatus === "to do" ||
              normalizedStatus === "in progress" ||
              normalizedStatus === "in development"
            : statusCategory === "review"
              ? normalizedStatus === "in review" ||
                normalizedStatus === "review" ||
                normalizedStatus === "in qa"
              : normalizedStatus === "done" ||
                normalizedStatus === "closed" ||
                normalizedStatus === "resolved";
        if (!matchesCategory) return false;
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
    const columns = {
      todo: { title: "To do", items: [] as ProjectTicket[] },
      inProgress: { title: "In progress", items: [] as ProjectTicket[] },
      review: { title: "In review", items: [] as ProjectTicket[] },
      done: { title: "Done", items: [] as ProjectTicket[] },
      other: { title: "Other", items: [] as ProjectTicket[] },
    };

    const normalizeStatus = (status: string): keyof typeof columns => {
      const s = status.toLowerCase();
      if (s === "to do" || s === "open" || s === "backlog") return "todo";
      if (s === "in progress" || s === "in development") return "inProgress";
      if (s === "in review" || s === "review" || s === "in qa") return "review";
      if (s === "done" || s === "closed" || s === "resolved") return "done";
      return "other";
    };

    for (const ticket of filteredWorkItems) {
      columns[normalizeStatus(ticket.status)].items.push(ticket);
    }
    return columns;
  }, [filteredWorkItems]);

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
