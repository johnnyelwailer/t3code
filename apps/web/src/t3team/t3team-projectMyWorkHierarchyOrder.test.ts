import { describe, expect, it } from "vite-plus/test";

import { createProjectBacklogTestTicket as createTicket } from "./t3team-projectBacklogTestUtils";
import {
  buildSubtreeLastTouchedById,
  getOrderedHierarchySiblings,
  type ProjectMyWorkHierarchyOrder,
} from "./t3team-projectMyWorkHierarchyOrder";
import { buildProjectTicketHierarchy } from "./t3team-ticketHierarchy";

const recentFirst: ProjectMyWorkHierarchyOrder = { sortBy: "updated", sortDirection: "desc" };

function ids(tickets: ReadonlyArray<{ id: string }>) {
  return tickets.map((ticket) => ticket.id);
}

describe("list lens hierarchy order", () => {
  const oldStory = createTicket({ id: "old-story", issueType: "Story", updatedAt: "2026-01-01" });
  const newStory = createTicket({ id: "new-story", issueType: "Story", updatedAt: "2026-09-01" });
  const subtaskOfOld = createTicket({
    id: "sub-of-old",
    issueType: "Sub-task",
    parentId: "old-story",
    updatedAt: "2026-10-01",
  });
  const hierarchy = buildProjectTicketHierarchy([oldStory, newStory, subtaskOfOld]);
  const lastTouchedById = buildSubtreeLastTouchedById(hierarchy);

  it("keeps subtasks under their parent story", () => {
    expect(
      ids(
        getOrderedHierarchySiblings({
          hierarchy,
          parentId: "old-story",
          order: recentFirst,
          lastTouchedById,
        }),
      ),
    ).toEqual(["sub-of-old"]);
    expect(
      ids(
        getOrderedHierarchySiblings({
          hierarchy,
          parentId: null,
          order: recentFirst,
          lastTouchedById,
        }),
      ),
    ).not.toContain("sub-of-old");
  });

  it("ranks a story by its freshest subtask, not just its own timestamp", () => {
    expect(lastTouchedById.get("old-story")).toBe(Date.parse("2026-10-01"));
    expect(
      ids(
        getOrderedHierarchySiblings({
          hierarchy,
          parentId: null,
          order: recentFirst,
          lastTouchedById,
        }),
      ),
    ).toEqual(["old-story", "new-story"]);
  });

  it("flips with the sort direction and honours other sort keys", () => {
    expect(
      ids(
        getOrderedHierarchySiblings({
          hierarchy,
          parentId: null,
          order: { sortBy: "updated", sortDirection: "asc" },
          lastTouchedById,
        }),
      ),
    ).toEqual(["new-story", "old-story"]);
    expect(
      ids(
        getOrderedHierarchySiblings({
          hierarchy,
          parentId: null,
          order: { sortBy: "title", sortDirection: "asc" },
          lastTouchedById,
        }),
      ),
    ).toEqual(["new-story", "old-story"]);
  });

  it("does not lose a subtask whose parent is not loaded", () => {
    const orphan = createTicket({
      id: "orphan",
      issueType: "Sub-task",
      parentId: "missing-parent",
      updatedAt: "2026-05-01",
    });
    const withOrphan = buildProjectTicketHierarchy([newStory, orphan]);
    expect(
      ids(
        getOrderedHierarchySiblings({
          hierarchy: withOrphan,
          parentId: null,
          order: recentFirst,
          lastTouchedById: buildSubtreeLastTouchedById(withOrphan),
        }),
      ),
    ).toEqual(["new-story", "orphan"]);
  });
});
