import {
  digestStoryAdjacency,
  type DigestStoryAdjacency,
} from "~/t3team/t3team-projectMyWorkDigestAdjacency";
import type { DigestGraph, DigestSection } from "~/t3team/t3team-projectMyWorkDigestPlan";
import { buildProjectTicketHierarchy } from "~/t3team/t3team-ticketHierarchy";
import type { ProjectTicket } from "~/t3team/t3team-types";

type DigestStoryGroupModel = {
  parent: ProjectTicket | null;
  items: DigestSection["items"];
  otherChildren: ProjectTicket[];
  /** The story's PRs go on the header only when no row anywhere shows the story already. */
  showStoryPrs: boolean;
  /** The work around the group's rows, in attention tiers; empty for parentless groups. */
  adjacency: DigestStoryAdjacency;
};

const NO_ADJACENCY: DigestStoryAdjacency = { active: [], quiet: [] };

/**
 * Every ticket the open lanes put on screen: each item, and the story heading its group. A
 * story's "rest of this story" chips leave these out, so one ticket never shows twice.
 */
export function digestShownTicketIds(
  sections: readonly DigestSection[],
  graph: DigestGraph,
): ReadonlySet<string> {
  const { parentByChildId } = buildProjectTicketHierarchy(graph.tickets);
  const shown = new Set<string>();
  for (const section of sections) {
    for (const item of section.items) {
      shown.add(item.ticketId);
      const parentId = parentByChildId.get(item.ticketId);
      if (parentId) shown.add(parentId);
    }
  }
  return shown;
}

/**
 * The items a section renders as rows. In the main lane a story that heads a group in the same
 * section shows once, as that group's header — not again as a row in another group.
 */
function digestRowItems(
  section: DigestSection,
  parentByChildId: ReadonlyMap<string, string>,
): DigestSection["items"] {
  if (section.placement !== "main") return section.items;
  const parents = new Set(section.items.flatMap((i) => parentByChildId.get(i.ticketId) ?? []));
  return section.items.filter((item) => !parents.has(item.ticketId));
}

/** Every ticket the lanes render as a row; a story among them keeps its PRs on that row. */
export function digestRowTicketIds(
  sections: readonly DigestSection[],
  graph: DigestGraph,
): ReadonlySet<string> {
  const { parentByChildId } = buildProjectTicketHierarchy(graph.tickets);
  return new Set(
    sections.flatMap((s) => digestRowItems(s, parentByChildId).map((item) => item.ticketId)),
  );
}

/** A main-lane section's items under their story, with the story's children not shown anywhere. */
export function groupByParent(
  section: DigestSection,
  graph: DigestGraph,
  ticketsById: ReadonlyMap<string, ProjectTicket>,
  shownElsewhere: ReadonlySet<string> = new Set(),
  rowTicketIds: ReadonlySet<string> = new Set(),
): DigestStoryGroupModel[] {
  const hierarchy = buildProjectTicketHierarchy(graph.tickets);
  const groups = new Map<string | null, DigestStoryGroupModel>();
  for (const item of digestRowItems(section, hierarchy.parentByChildId)) {
    const parentId = hierarchy.parentByChildId.get(item.ticketId) ?? null;
    const parent = parentId ? (ticketsById.get(parentId) ?? null) : null;
    const key = parent?.id ?? null;
    const group = groups.get(key) ?? {
      parent,
      items: [],
      otherChildren: [],
      showStoryPrs: false,
      adjacency: NO_ADJACENCY,
    };
    groups.set(key, { ...group, items: [...group.items, item] });
  }
  for (const group of groups.values()) {
    if (!group.parent) continue;
    group.showStoryPrs = !rowTicketIds.has(group.parent.id);
    const active = new Set(group.items.map((item) => item.ticketId));
    group.otherChildren = (hierarchy.childrenByParentId.get(group.parent.id) ?? []).filter(
      (child) => !active.has(child.id) && !shownElsewhere.has(child.id),
    );
    const hiddenKeys = new Set(
      [...shownElsewhere, ...active, group.parent.id].flatMap((id) => {
        const key = ticketsById.get(id)?.ref.displayId;
        return key ? [key] : [];
      }),
    );
    group.adjacency = digestStoryAdjacency({
      rowIds: active,
      storyId: group.parent.id,
      siblings: group.otherChildren,
      dependencies: graph.dependencies ?? [],
      hiddenKeys,
      ticketsById,
      viewerName: graph.viewer.name,
    });
  }
  return [...groups.values()];
}
