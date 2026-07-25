import type { ProjectTicket } from "~/t3team/t3team-types";

export interface ProjectTicketHierarchy {
  roots: readonly ProjectTicket[];
  unresolvedChildren: readonly ProjectTicket[];
  childrenByParentId: ReadonlyMap<string, readonly ProjectTicket[]>;
  parentByChildId: ReadonlyMap<string, string>;
}

function looksLikeChildTicket(ticket: ProjectTicket): boolean {
  const issueType = (ticket.issueType ?? ticket.ref.type ?? "").toLowerCase();
  return issueType.includes("subtask") || issueType.includes("sub-task");
}

function wouldCreateCycle(
  childId: string,
  parentId: string,
  resolvedParentByChildId: ReadonlyMap<string, string>,
): boolean {
  let currentParentId: string | undefined = parentId;
  while (currentParentId) {
    if (currentParentId === childId) {
      return true;
    }
    currentParentId = resolvedParentByChildId.get(currentParentId);
  }
  return false;
}

export function buildProjectTicketHierarchy(
  tickets: readonly ProjectTicket[],
): ProjectTicketHierarchy {
  const ticketById = new Map(tickets.map((ticket) => [ticket.id, ticket]));
  const resolvedParentByChildId = new Map<string, string>();
  const mutableChildrenByParentId = new Map<string, ProjectTicket[]>();
  const unresolvedChildren: ProjectTicket[] = [];

  const resolveParentId = (ticket: ProjectTicket): string | null => {
    if (ticket.parentId && ticket.parentId !== ticket.id && ticketById.has(ticket.parentId)) {
      return ticket.parentId;
    }

    if (!looksLikeChildTicket(ticket)) {
      return null;
    }

    const childTitle = ticket.ref.title.toLowerCase();
    for (const candidate of tickets) {
      if (candidate.id === ticket.id) continue;
      const candidateDisplayId = candidate.ref.displayId.toLowerCase();
      if (childTitle.includes(candidateDisplayId)) {
        return candidate.id;
      }
    }

    return null;
  };

  for (const ticket of tickets) {
    const resolvedParentId = resolveParentId(ticket);
    if (!resolvedParentId) {
      if (looksLikeChildTicket(ticket)) {
        unresolvedChildren.push(ticket);
      }
      continue;
    }

    if (wouldCreateCycle(ticket.id, resolvedParentId, resolvedParentByChildId)) {
      if (looksLikeChildTicket(ticket)) {
        unresolvedChildren.push(ticket);
      }
      continue;
    }

    resolvedParentByChildId.set(ticket.id, resolvedParentId);
    const existingChildren = mutableChildrenByParentId.get(resolvedParentId) ?? [];
    existingChildren.push(ticket);
    mutableChildrenByParentId.set(resolvedParentId, existingChildren);
  }

  const unresolvedChildIds = new Set(unresolvedChildren.map((ticket) => ticket.id));
  const roots = tickets.filter(
    (ticket) => !resolvedParentByChildId.has(ticket.id) && !unresolvedChildIds.has(ticket.id),
  );

  return {
    roots,
    unresolvedChildren,
    childrenByParentId: mutableChildrenByParentId,
    parentByChildId: resolvedParentByChildId,
  };
}
