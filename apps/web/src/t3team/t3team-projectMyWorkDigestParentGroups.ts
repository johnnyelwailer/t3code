import type { ProjectTicket } from "~/t3team/t3team-types";

/**
 * A run of digest rows under the story they belong to. A bare subtask ("FE: Review") means
 * nothing on its own, so subtasks group under their parent story: the story is the header, its
 * subtasks nest below. `parentItem` is the story's own row when the list holds it too, so the
 * story shows once, as the header. Items that are not subtasks (stories, bugs, tasks) or whose
 * parent the digest does not hold stay standalone (`parent: null`, one item each).
 */
export type DigestParentGroup<T> = {
  readonly parent: ProjectTicket | null;
  readonly parentItem?: T;
  readonly items: readonly T[];
};

function isSubtask(ticket: ProjectTicket): boolean {
  if (ticket.issueTypeIsSubtask !== undefined) return ticket.issueTypeIsSubtask;
  const type = (ticket.issueType ?? ticket.ref.type ?? "").toLowerCase();
  return type.includes("subtask") || type.includes("sub-task");
}

/** The ticket's parent story, when it is a subtask and the digest holds the parent. */
export function digestSubtaskParent(
  ticket: ProjectTicket | undefined,
  ticketsById: ReadonlyMap<string, ProjectTicket>,
): ProjectTicket | undefined {
  if (!ticket || !ticket.parentId || ticket.parentId === ticket.id || !isSubtask(ticket)) {
    return undefined;
  }
  return ticketsById.get(ticket.parentId);
}

/**
 * Groups `items` (in their given order) by parent story. A group sits where its first subtask or
 * its story's own row first appears; standalone items keep their place.
 */
export function digestParentGroups<T>(
  items: readonly T[],
  ticketIdOf: (item: T) => string | undefined,
  ticketsById: ReadonlyMap<string, ProjectTicket>,
): DigestParentGroup<T>[] {
  const parentOf = new Map<T, ProjectTicket>();
  const parentIds = new Set<string>();
  for (const item of items) {
    const id = ticketIdOf(item);
    const parent = digestSubtaskParent(
      id !== undefined ? ticketsById.get(id) : undefined,
      ticketsById,
    );
    if (parent) {
      parentOf.set(item, parent);
      parentIds.add(parent.id);
    }
  }
  type Draft = { parent: ProjectTicket | null; parentItem?: T; items: T[] };
  const out: Draft[] = [];
  const byParent = new Map<string, Draft>();
  const groupFor = (parent: ProjectTicket): Draft => {
    const existing = byParent.get(parent.id);
    if (existing) return existing;
    const draft: Draft = { parent, items: [] };
    byParent.set(parent.id, draft);
    out.push(draft);
    return draft;
  };
  for (const item of items) {
    const parent = parentOf.get(item);
    if (parent) {
      groupFor(parent).items.push(item);
      continue;
    }
    const id = ticketIdOf(item);
    const story = id !== undefined && parentIds.has(id) ? ticketsById.get(id) : undefined;
    if (story) {
      groupFor(story).parentItem = item;
      continue;
    }
    out.push({ parent: null, items: [item] });
  }
  return out.map((draft) =>
    draft.parentItem !== undefined
      ? { parent: draft.parent, parentItem: draft.parentItem, items: draft.items }
      : { parent: draft.parent, items: draft.items },
  );
}
