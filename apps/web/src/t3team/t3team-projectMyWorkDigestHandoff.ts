import type { DigestGraph, DigestSection } from "~/t3team/t3team-projectMyWorkDigestTypes";
import {
  getDigestTicketStage,
  isDigestStageHandedOn,
  isDigestStageInDevelopment,
} from "~/t3team/t3team-projectMyWorkDigestStage";
import { buildProjectTicketHierarchy } from "~/t3team/t3team-ticketHierarchy";
import type { ProjectTicket } from "~/t3team/t3team-types";

/** The handed-on lanes: something of the viewer's still open on it, or nothing at all. */
export const DIGEST_HANDOFF_OPEN_ID = "handed-off-open";
export const DIGEST_HANDOFF_ID = "handed-off";
const HANDOFF_IDS = new Set([DIGEST_HANDOFF_OPEN_ID, DIGEST_HANDOFF_ID]);

export function isDigestTicketMine(ticket: ProjectTicket, graph: DigestGraph): boolean {
  const assignee = ticket.assignee?.trim().toLowerCase();
  const viewer = graph.viewer.name?.trim().toLowerCase();
  return !!assignee && !!viewer && assignee === viewer;
}

/** In review or test: the assignee built it and handed it on; it is no longer theirs to move. */
export function isDigestTicketHandedOn(ticket: ProjectTicket): boolean {
  return isDigestStageHandedOn(getDigestTicketStage(ticket.status));
}

/**
 * The viewer's ticket handed on and so off their working lanes — unless it still waits on a
 * decision of theirs, which outranks everything.
 */
export function isDigestTicketHandedOff(graph: DigestGraph, ticket: ProjectTicket): boolean {
  return isDigestTicketHandedOn(ticket) && !graph.decisions.some((d) => d.ticketId === ticket.id);
}

/** Every open ticket of the viewer's that is handed off (see `isDigestTicketHandedOff`). */
export function digestHandedOffIds(graph: DigestGraph): ReadonlySet<string> {
  return new Set(
    graph.tickets
      .filter((t) => isDigestTicketMine(t, graph) && isDigestTicketHandedOff(graph, t))
      .map((t) => t.id),
  );
}

type Children = ReadonlyMap<string, readonly ProjectTicket[]>;

/**
 * What the viewer still has open on a handed-on ticket, as one short line: an unmerged PR naming
 * it ("draft PR open"), else a subtask of theirs still in development. Undefined: nothing.
 */
export function digestOpenWorkLine(
  graph: DigestGraph,
  ticket: ProjectTicket,
  children: () => Children = () => buildProjectTicketHierarchy(graph.tickets).childrenByParentId,
): string | undefined {
  const prs = graph.changeRequests.filter(
    (pr) => pr.ticketId === ticket.id && pr.state !== "merged",
  );
  if (prs.length > 1) return `${prs.length} PRs open`;
  if (prs[0])
    return `${prs[0].state === "draft" ? "draft PR" : "PR"} open · ${prs[0].repo}#${prs[0].number}`;
  const subtasks = (children().get(ticket.id) ?? []).filter(
    (child) =>
      isDigestTicketMine(child, graph) &&
      isDigestStageInDevelopment(getDigestTicketStage(child.status)),
  );
  if (subtasks.length > 1) return `${subtasks.length} open subtasks`;
  return subtasks[0] ? `open subtask ${subtasks[0].ref.displayId}` : undefined;
}

/**
 * Splits the viewer's handed-on tickets off their working lanes: with open work they become one
 * compact line each in the side lane, without it they fold into a footer count.
 */
export function digestHandoffSections(
  graph: DigestGraph,
  tickets: readonly ProjectTicket[],
): DigestSection[] {
  let children: Children | undefined;
  const lazyChildren = () =>
    (children ??= buildProjectTicketHierarchy(graph.tickets).childrenByParentId);
  const open: DigestSection["items"][number][] = [];
  const quiet: DigestSection["items"][number][] = [];
  for (const ticket of tickets) {
    const why = digestOpenWorkLine(graph, ticket, lazyChildren);
    if (why) open.push({ ticketId: ticket.id, why, compact: true });
    else quiet.push({ ticketId: ticket.id });
  }
  const section = (id: string, placement: "side" | "footer", hint: string, items: typeof open) => ({
    id,
    kind: "items" as const,
    widget: "my-work.tickets",
    placement,
    heading: "Handed off",
    hint,
    items,
  });
  return [
    ...(open.length
      ? [
          section(
            DIGEST_HANDOFF_OPEN_ID,
            "side",
            "in review or test, something of yours still open",
            open,
          ),
        ]
      : []),
    ...(quiet.length
      ? [section(DIGEST_HANDOFF_ID, "footer", "in review or test, nothing of yours open", quiet)]
      : []),
  ];
}

/**
 * An agent arrangement made before a ticket moved on still lists it as work: the ticket leaves
 * that section and joins the handed-off lanes instead. Returns the sections without those items
 * and the ids it took out.
 */
export function withoutHandedOnItems(
  sections: readonly DigestSection[],
  handedOn: ReadonlySet<string>,
): { readonly sections: DigestSection[]; readonly moved: ReadonlySet<string> } {
  const moved = new Set<string>();
  const kept = sections.map((section) => {
    if (HANDOFF_IDS.has(section.id)) return section;
    const items = section.items.filter((item) => {
      if (!handedOn.has(item.ticketId)) return true;
      moved.add(item.ticketId);
      return false;
    });
    return items.length === section.items.length ? section : { ...section, items };
  });
  return { sections: kept, moved };
}
