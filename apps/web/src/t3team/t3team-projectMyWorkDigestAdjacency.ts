import type { DigestDependency } from "~/t3team/t3team-projectMyWorkDigestPlan";
import {
  getProjectTicketKanbanLane,
  getProjectTicketKanbanLaneRank,
} from "~/t3team/t3team-projectTicketStatus";
import type { ProjectTicket } from "~/t3team/t3team-types";

export type DigestLane = ReturnType<typeof getProjectTicketKanbanLane>;

/**
 * One piece of work next to the viewer's in a story card: a sibling under the same story, or a
 * ticket linked to one of the viewer's by a block. `blocks-you` holds the viewer up; `waits-on-you`
 * is held up by the viewer.
 */
export type DigestAdjacentItem = {
  readonly key: string;
  readonly title: string;
  readonly status: string;
  readonly lane: DigestLane;
  readonly relation: "blocks-you" | "waits-on-you" | "sibling";
  readonly assignee?: string;
  readonly assigneeAvatarUrl?: string;
  /** Set when the digest holds the ticket, so a click can open it in the app. */
  readonly ticketId?: string;
  readonly url?: string;
  /** The viewer's ticket a block hangs on. */
  readonly viewerTicketKey?: string;
};

/** Attention tiers under the viewer's own rows: compact pills, then one collapsed count. */
export type DigestStoryAdjacency = {
  readonly active: readonly DigestAdjacentItem[];
  readonly quiet: readonly DigestAdjacentItem[];
};

const RELATION_RANK: Record<DigestAdjacentItem["relation"], number> = {
  "blocks-you": 0,
  "waits-on-you": 1,
  sibling: 2,
};

const sameName = (a: string | undefined, b: string) =>
  (a ?? "").trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Tier 2 (`active`): any open block, siblings in progress or review, and the viewer's own To Do
 * siblings. Tier 3 (`quiet`): everything done, and To Do siblings that belong to someone else or
 * nobody. Blocks on the viewer rank first, then blocks by the viewer, then siblings by lane.
 */
export function isDigestAdjacentActive(item: DigestAdjacentItem, viewerName: string): boolean {
  if (item.lane === "done") return false;
  if (item.relation !== "sibling") return true;
  return item.lane !== "todo" || sameName(item.assignee, viewerName);
}

/**
 * The work around the viewer's rows in one story card. `siblings` are the story's children not on
 * screen anywhere; `dependencies` are the digest's links, of which only those on `rowIds` count —
 * plus blocks on `storyId`, since the story is the card's header, not a row with its own line.
 * A same-story link adds a sibling the tickets list lacks; a ticket on screen (`hiddenKeys`) is
 * never repeated as a sibling, but a block is kept — the relation is the news, not the ticket.
 */
export function digestStoryAdjacency(input: {
  readonly rowIds: ReadonlySet<string>;
  readonly storyId?: string;
  readonly siblings: readonly ProjectTicket[];
  readonly dependencies: readonly DigestDependency[];
  readonly hiddenKeys: ReadonlySet<string>;
  readonly ticketsById: ReadonlyMap<string, ProjectTicket>;
  readonly viewerName: string;
}): DigestStoryAdjacency {
  const idByKey = new Map([...input.ticketsById.values()].map((t) => [t.ref.displayId, t.id]));
  const byKey = new Map<string, DigestAdjacentItem>();
  const put = (item: DigestAdjacentItem) => {
    const seen = byKey.get(item.key);
    if (!seen || RELATION_RANK[item.relation] < RELATION_RANK[seen.relation])
      byKey.set(item.key, item);
  };
  for (const sibling of input.siblings) {
    put({
      key: sibling.ref.displayId,
      title: sibling.ref.title,
      status: sibling.status,
      lane: getProjectTicketKanbanLane(sibling.status),
      relation: "sibling",
      ticketId: sibling.id,
      url: sibling.ref.url,
      ...(sibling.assignee ? { assignee: sibling.assignee } : {}),
      ...(sibling.assigneeAvatarUrl ? { assigneeAvatarUrl: sibling.assigneeAvatarUrl } : {}),
    });
  }
  for (const dependency of input.dependencies) {
    const { other } = dependency;
    const isBlock = dependency.relation !== "same-story";
    const onStory = isBlock && dependency.ticketId === input.storyId;
    if (!input.rowIds.has(dependency.ticketId) && !onStory) continue;
    if (!isBlock && input.hiddenKeys.has(other.key)) continue;
    const ticketId = idByKey.get(other.key);
    const viewerTicketKey = input.ticketsById.get(dependency.ticketId)?.ref.displayId;
    put({
      key: other.key,
      title: other.title,
      status: other.status,
      lane: getProjectTicketKanbanLane(other.status),
      relation: !isBlock
        ? "sibling"
        : dependency.relation === "you-wait-on"
          ? "blocks-you"
          : "waits-on-you",
      ...(other.assignee ? { assignee: other.assignee } : {}),
      ...(other.assigneeAvatarUrl ? { assigneeAvatarUrl: other.assigneeAvatarUrl } : {}),
      ...(ticketId ? { ticketId } : {}),
      ...(other.url ? { url: other.url } : {}),
      ...(isBlock && viewerTicketKey ? { viewerTicketKey } : {}),
    });
  }
  const items = [...byKey.values()];
  const active = items
    .filter((item) => isDigestAdjacentActive(item, input.viewerName))
    .toSorted(
      (a, b) =>
        RELATION_RANK[a.relation] - RELATION_RANK[b.relation] ||
        getProjectTicketKanbanLaneRank(a.status) - getProjectTicketKanbanLaneRank(b.status) ||
        a.key.localeCompare(b.key),
    );
  const quiet = items
    .filter((item) => !isDigestAdjacentActive(item, input.viewerName))
    .toSorted(
      (a, b) => Number(a.lane === "done") - Number(b.lane === "done") || a.key.localeCompare(b.key),
    );
  return { active, quiet };
}

/** The collapsed tier as one line: "3 done · 2 to do". */
export function digestQuietSummary(quiet: readonly DigestAdjacentItem[]): string {
  const done = quiet.filter((item) => item.lane === "done").length;
  const parts = [
    ...(done > 0 ? [`${done} done`] : []),
    ...(quiet.length - done > 0 ? [`${quiet.length - done} to do`] : []),
  ];
  return parts.join(" · ");
}
