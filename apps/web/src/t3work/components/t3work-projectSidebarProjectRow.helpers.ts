import type { ProjectTicket } from "~/t3work/t3work-types";
import { readLocalApi } from "~/localApi";
import type { TicketViewMode } from "./t3work-projectSidebarShared";

type TicketHierarchyLike = {
  roots: readonly ProjectTicket[];
  unresolvedChildren: readonly ProjectTicket[];
  childrenByParentId: ReadonlyMap<string, readonly ProjectTicket[]>;
};

type ProjectContextMenuInput = {
  clientX: number;
  clientY: number;
  projectId: string;
  projectTitle: string;
  onManageProjectRepositories: (projectId: string) => void;
  onDeleteProject: (projectId: string) => void;
  onBeginRename: () => void;
};

export function buildProjectContextMenuItems() {
  return [
    { id: "rename", label: "Rename project" },
    { id: "manage-repositories", label: "Manage linked repositories" },
    { id: "delete", label: "Delete project", destructive: true },
  ] as const;
}

function countVisibleTicketTreeNodes(
  ticket: ProjectTicket,
  childrenByParentId: ReadonlyMap<string, readonly ProjectTicket[]>,
): number {
  const children = childrenByParentId.get(ticket.id) ?? [];
  return (
    1 +
    children.reduce(
      (count, child) => count + countVisibleTicketTreeNodes(child, childrenByParentId),
      0,
    )
  );
}

export function computeHiddenTicketCount(input: {
  ticketViewMode: TicketViewMode;
  projectTicketsLength: number;
  visibleFlatTicketsLength: number;
  visibleTreeRoots: ReadonlyArray<ProjectTicket>;
  visibleTreeUnresolvedChildrenLength: number;
  childrenByParentId: ReadonlyMap<string, readonly ProjectTicket[]>;
}): number {
  if (input.ticketViewMode === "flat") {
    return Math.max(0, input.projectTicketsLength - input.visibleFlatTicketsLength);
  }
  const visibleTreeCount =
    input.visibleTreeRoots.reduce(
      (count, ticket) => count + countVisibleTicketTreeNodes(ticket, input.childrenByParentId),
      0,
    ) + input.visibleTreeUnresolvedChildrenLength;
  return Math.max(0, input.projectTicketsLength - visibleTreeCount);
}

export async function showProjectContextMenu(input: ProjectContextMenuInput): Promise<void> {
  const api = readLocalApi();
  if (!api) return;

  const action = await api.contextMenu.show(buildProjectContextMenuItems(), {
    x: input.clientX,
    y: input.clientY,
  });

  if (action === "rename") {
    input.onBeginRename();
    return;
  }
  if (action === "manage-repositories") {
    input.onManageProjectRepositories(input.projectId);
    return;
  }
  if (action !== "delete") {
    return;
  }
  const confirmed = await api.dialogs.confirm(`Delete project "${input.projectTitle}"?`);
  if (confirmed) {
    input.onDeleteProject(input.projectId);
  }
}

export function deriveTicketVisibility(input: {
  projectTickets: readonly ProjectTicket[];
  ticketHierarchy: TicketHierarchyLike;
  ticketViewMode: TicketViewMode;
}) {
  const visibleFlatTickets = input.projectTickets.slice(0, 5);
  const visibleTreeRoots = input.ticketHierarchy.roots.slice(0, 5);
  const availableSlots = Math.max(0, 5 - visibleTreeRoots.length);
  const visibleTreeUnresolvedChildren =
    availableSlots === 0
      ? ([] as readonly ProjectTicket[])
      : input.ticketHierarchy.unresolvedChildren.slice(0, availableSlots);

  const hiddenTicketCount = computeHiddenTicketCount({
    ticketViewMode: input.ticketViewMode,
    projectTicketsLength: input.projectTickets.length,
    visibleFlatTicketsLength: visibleFlatTickets.length,
    visibleTreeRoots,
    visibleTreeUnresolvedChildrenLength: visibleTreeUnresolvedChildren.length,
    childrenByParentId: input.ticketHierarchy.childrenByParentId,
  });

  return {
    visibleFlatTickets,
    visibleTreeRoots,
    visibleTreeUnresolvedChildren,
    hiddenTicketCount,
  };
}
