import { describe, expect, it } from "vite-plus/test";

import {
  buildPinnedOnlyMyActivityFeed,
  deriveTicketVisibility,
} from "./t3team-projectSidebarProjectRow.helpers";
import type { GitHubWorkActivityItem } from "~/t3team/t3team-githubActivity";
import { buildProjectTicketHierarchy } from "~/t3team/t3team-ticketHierarchy";
import type { ProjectTicket } from "~/t3team/t3team-types";
import {
  buildGitHubActivitySidebarPinnedItem,
  buildTicketSidebarPinnedItem,
  buildTicketSidebarPinnedItemId,
} from "~/t3team/t3team-sidebarPinningTypes";
import type { T3TeamSidebarPinnedItem } from "~/t3team/t3team-sidebarPinningTypes";
import type { ResolvedPinnedSidebarItem } from "./t3team-useProjectSidebarPinnedItems";

function createTicket(id: string, parentId?: string): ProjectTicket {
  return {
    id,
    projectId: "project-1",
    ...(parentId ? { parentId } : {}),
    ref: {
      provider: "jira",
      kind: "issue",
      id,
      displayId: id.toUpperCase(),
      title: `Ticket ${id}`,
      url: `https://example.test/${id}`,
      projectId: "project-1",
    },
    status: "In Progress",
    updatedAt: "2026-05-23T12:00:00.000Z",
  };
}

describe("deriveTicketVisibility", () => {
  it("applies stored Jira sidebar ids before truncating the flat list", () => {
    const tickets = ["a", "b", "c", "d", "e", "f"].map((id) => createTicket(id));

    const visibility = deriveTicketVisibility({
      projectId: "project-1",
      projectTickets: tickets,
      ticketHierarchy: {
        roots: tickets,
        unresolvedChildren: [],
        childrenByParentId: new Map(),
        parentByChildId: new Map(),
      },
      ticketViewMode: "flat",
      hiddenItemIds: [buildTicketSidebarPinnedItemId({ projectId: "project-1", ticketId: "a" })],
      orderedItemIds: [
        buildTicketSidebarPinnedItemId({ projectId: "project-1", ticketId: "f" }),
        buildTicketSidebarPinnedItemId({ projectId: "project-1", ticketId: "c" }),
      ],
    });

    expect(visibility.visibleFlatTickets.map((ticket) => ticket.id)).toEqual([
      "f",
      "c",
      "b",
      "d",
      "e",
    ]);
    expect(visibility.hiddenTicketCount).toBe(1);
  });

  it("fills tree slots from unresolved Jira items after hidden roots are removed", () => {
    const rootA = createTicket("root-a");
    const rootB = createTicket("root-b");
    const unresolved = ["u1", "u2", "u3", "u4"].map((id) => createTicket(id));
    const tickets = [rootA, rootB, ...unresolved];

    const visibility = deriveTicketVisibility({
      projectId: "project-1",
      projectTickets: tickets,
      ticketHierarchy: {
        roots: [rootA, rootB],
        unresolvedChildren: unresolved,
        childrenByParentId: new Map(),
        parentByChildId: new Map(),
      },
      ticketViewMode: "tree",
      hiddenItemIds: [
        buildTicketSidebarPinnedItemId({ projectId: "project-1", ticketId: "root-b" }),
      ],
      orderedItemIds: [
        buildTicketSidebarPinnedItemId({ projectId: "project-1", ticketId: "u3" }),
        buildTicketSidebarPinnedItemId({ projectId: "project-1", ticketId: "u1" }),
      ],
    });

    expect(visibility.visibleTreeRoots.map((ticket) => ticket.id)).toEqual(["root-a"]);
    expect(visibility.visibleTreeUnresolvedChildren.map((ticket) => ticket.id)).toEqual([
      "u3",
      "u1",
      "u2",
      "u4",
    ]);
    expect(visibility.hiddenTicketCount).toBe(1);
  });

  it("builds a pinned-only feed slice from pinned tickets and pinned GitHub activity", () => {
    const ticketA = createTicket("a");
    const ticketB = createTicket("b");
    const linkedPinnedActivity: GitHubWorkActivityItem = {
      id: "gh-linked-pinned",
      repository: "t3tools/t3code",
      reason: "review_requested",
      workItemKey: ticketB.ref.displayId,
    };
    const linkedUnpinnedActivity: GitHubWorkActivityItem = {
      id: "gh-linked-unpinned",
      repository: "t3tools/t3code",
      reason: "commented",
      workItemKey: ticketB.ref.displayId,
    };
    const unlinkedPinnedActivity: GitHubWorkActivityItem = {
      id: "gh-unlinked-pinned",
      repository: "t3tools/t3code",
      reason: "assigned",
    };
    const pinnedItems: ReadonlyArray<ResolvedPinnedSidebarItem> = [
      {
        kind: "jira-work-item",
        pinnedItem: buildTicketSidebarPinnedItem({
          projectId: "project-1",
          ticketId: ticketA.id,
        }) as Extract<T3TeamSidebarPinnedItem, { kind: "jira-work-item" }>,
        ticket: ticketA,
        ticketThreads: [],
      },
      {
        kind: "github-activity",
        pinnedItem: buildGitHubActivitySidebarPinnedItem({
          projectId: "project-1",
          activityId: linkedPinnedActivity.id,
        }) as Extract<T3TeamSidebarPinnedItem, { kind: "github-activity" }>,
        item: linkedPinnedActivity,
        linkedWorkItem: ticketB,
      },
      {
        kind: "github-activity",
        pinnedItem: buildGitHubActivitySidebarPinnedItem({
          projectId: "project-1",
          activityId: unlinkedPinnedActivity.id,
        }) as Extract<T3TeamSidebarPinnedItem, { kind: "github-activity" }>,
        item: unlinkedPinnedActivity,
        linkedWorkItem: null,
      },
    ];

    const pinnedFeed = buildPinnedOnlyMyActivityFeed({
      projectId: "project-1",
      projectTickets: [ticketA, ticketB],
      ticketHierarchy: buildProjectTicketHierarchy([ticketA, ticketB]),
      ticketViewMode: "flat",
      hiddenItemIds: [],
      orderedItemIds: [
        buildTicketSidebarPinnedItemId({ projectId: "project-1", ticketId: ticketB.id }),
        buildTicketSidebarPinnedItemId({ projectId: "project-1", ticketId: ticketA.id }),
      ],
      pinnedItems,
      githubActivityByWorkItem: new Map([
        [ticketB.ref.displayId, [linkedPinnedActivity, linkedUnpinnedActivity]],
      ]),
      unlinkedGitHubActivityItems: [unlinkedPinnedActivity],
    });

    expect(pinnedFeed.visibleFlatTickets.map((ticket) => ticket.id)).toEqual(["b", "a"]);
    expect(pinnedFeed.projectTickets.map((ticket) => ticket.id)).toEqual(["b", "a"]);
    expect(pinnedFeed.ticketHierarchy.roots.map((ticket) => ticket.id)).toEqual(["a", "b"]);
    expect(pinnedFeed.githubActivityByWorkItem.get(ticketB.ref.displayId)).toEqual([
      linkedPinnedActivity,
    ]);
    expect(pinnedFeed.unlinkedGitHubActivityItems).toEqual([unlinkedPinnedActivity]);
    expect(pinnedFeed.unresolvedPinnedItems).toEqual([]);
    expect([...pinnedFeed.visibleTicketIds]).toEqual(["b", "a"]);
  });

  it("preserves the full visible hierarchy for pinned child tickets in tree mode", () => {
    const epic = createTicket("epic");
    const story = createTicket("story", epic.id);
    const subtask = createTicket("subtask", story.id);
    const unrelated = createTicket("other-root");
    const tickets = [epic, story, subtask, unrelated];
    const pinnedItems: ReadonlyArray<ResolvedPinnedSidebarItem> = [
      {
        kind: "jira-work-item",
        pinnedItem: buildTicketSidebarPinnedItem({
          projectId: "project-1",
          ticketId: story.id,
        }) as Extract<T3TeamSidebarPinnedItem, { kind: "jira-work-item" }>,
        ticket: story,
        ticketThreads: [],
      },
    ];

    const pinnedFeed = buildPinnedOnlyMyActivityFeed({
      projectId: "project-1",
      projectTickets: tickets,
      ticketHierarchy: buildProjectTicketHierarchy(tickets),
      ticketViewMode: "tree",
      hiddenItemIds: [],
      orderedItemIds: [],
      pinnedItems,
      githubActivityByWorkItem: new Map(),
      unlinkedGitHubActivityItems: [],
    });

    expect(pinnedFeed.projectTickets.map((ticket) => ticket.id)).toEqual([
      "epic",
      "story",
      "subtask",
    ]);
    expect(pinnedFeed.ticketHierarchy.roots.map((ticket) => ticket.id)).toEqual(["epic"]);
    expect(
      pinnedFeed.ticketHierarchy.childrenByParentId.get("epic")?.map((ticket) => ticket.id),
    ).toEqual(["story"]);
    expect(
      pinnedFeed.ticketHierarchy.childrenByParentId.get("story")?.map((ticket) => ticket.id),
    ).toEqual(["subtask"]);
    expect([...pinnedFeed.visibleTicketIds]).toEqual(["epic", "story", "subtask"]);
  });
});
