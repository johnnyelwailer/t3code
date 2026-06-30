import { describe, expect, it } from "vite-plus/test";
import { buildTicketRelationships } from "./t3work-ticketRelationships-helpers";
import type { ProjectTicket } from "./t3work-types";

function ticket(input: {
  id: string;
  displayId: string;
  title: string;
  parentId?: string;
}): ProjectTicket {
  return {
    id: input.id,
    projectId: "project-1",
    ...(input.parentId ? { parentId: input.parentId } : {}),
    ref: {
      provider: "atlassian",
      kind: "issue",
      id: input.id,
      displayId: input.displayId,
      title: input.title,
      url: `https://example.test/browse/${input.displayId}`,
      projectId: "EXT-1",
      type: "Task",
    },
    issueType: "Task",
    status: "To Do",
    updatedAt: "2026-06-30T00:00:00.000Z",
  };
}

describe("buildTicketRelationships", () => {
  it("dedupes relationship entries by normalized ticket identity", () => {
    const child = ticket({
      id: "10001",
      displayId: "IES-21429",
      title: "Loaded child text",
      parentId: "10000",
    });

    const relationships = buildTicketRelationships({
      projectTickets: [child],
      ticketId: "10000",
      displayId: "IES-21428",
      ticketParentId: undefined,
      snapshotParentId: undefined,
      snapshotRaw: {
        fields: {
          subtasks: [{ key: "IES-21429" }],
        },
      },
    });

    expect(relationships.childEntries).toHaveLength(1);
    expect(relationships.childEntries[0]?.ticket).toBe(child);
    expect(relationships.childEntries[0]?.ticket?.ref.title).toBe("Loaded child text");
  });
});
