import { describe, expect, it } from "vite-plus/test";
import { buildProjectTicketHierarchy } from "./t3team-ticketHierarchy";
import type { ProjectTicket } from "./t3team-types";

type TicketOverride = Omit<Partial<ProjectTicket>, "ref"> & {
  ref?: Partial<ProjectTicket["ref"]>;
};

function createTicket(overrides: TicketOverride & Pick<ProjectTicket, "id">): ProjectTicket {
  const refType = overrides.ref?.type ?? overrides.issueType;

  return {
    id: overrides.id,
    projectId: overrides.projectId ?? "project-1",
    ...(typeof overrides.parentId === "string" ? { parentId: overrides.parentId } : {}),
    ref: {
      provider: "atlassian",
      kind: "issue",
      id: overrides.id,
      displayId: overrides.ref?.displayId ?? overrides.id.toUpperCase(),
      title: overrides.ref?.title ?? overrides.id,
      url: overrides.ref?.url ?? "https://example.test",
      projectId: overrides.ref?.projectId ?? "EXT-1",
      ...(typeof refType === "string" ? { type: refType } : {}),
      ...(overrides.ref?.issueTypeIconUrl
        ? { issueTypeIconUrl: overrides.ref.issueTypeIconUrl }
        : {}),
    },
    ...(typeof overrides.issueType === "string" ? { issueType: overrides.issueType } : {}),
    ...(typeof overrides.issueTypeIconUrl === "string"
      ? { issueTypeIconUrl: overrides.issueTypeIconUrl }
      : {}),
    status: overrides.status ?? "To Do",
    ...(typeof overrides.priority === "string" ? { priority: overrides.priority } : {}),
    ...(typeof overrides.assignee === "string" ? { assignee: overrides.assignee } : {}),
    updatedAt: overrides.updatedAt ?? "2026-05-15T00:00:00.000Z",
  };
}

describe("buildProjectTicketHierarchy", () => {
  it("groups explicit parent-child relationships and keeps unresolved children separate", () => {
    const story = createTicket({
      id: "story-1",
      issueType: "Story",
      ref: { displayId: "PROJ-1", title: "Story" },
    });
    const subtask = createTicket({
      id: "subtask-1",
      parentId: story.id,
      issueType: "Sub-task",
      ref: { displayId: "PROJ-2", title: "Subtask" },
    });
    const nestedBug = createTicket({
      id: "bug-1",
      parentId: subtask.id,
      issueType: "Bug",
      ref: { displayId: "PROJ-3", title: "Bug in subtask" },
    });
    const orphanSubtask = createTicket({
      id: "subtask-2",
      issueType: "Sub-task",
      ref: { displayId: "PROJ-4", title: "Orphan subtask" },
    });
    const task = createTicket({
      id: "task-1",
      issueType: "Task",
      ref: { displayId: "PROJ-5", title: "Task" },
    });

    const hierarchy = buildProjectTicketHierarchy([story, subtask, nestedBug, orphanSubtask, task]);

    expect(hierarchy.roots.map((ticket) => ticket.id)).toEqual([story.id, task.id]);
    expect(hierarchy.childrenByParentId.get(story.id)?.map((ticket) => ticket.id)).toEqual([
      subtask.id,
    ]);
    expect(hierarchy.childrenByParentId.get(subtask.id)?.map((ticket) => ticket.id)).toEqual([
      nestedBug.id,
    ]);
    expect(hierarchy.parentByChildId.get(subtask.id)).toBe(story.id);
    expect(hierarchy.parentByChildId.get(nestedBug.id)).toBe(subtask.id);
    expect(hierarchy.unresolvedChildren.map((ticket) => ticket.id)).toEqual([orphanSubtask.id]);
  });

  it("falls back to display-id matching for subtask-style children without a parent id", () => {
    const task = createTicket({
      id: "task-1",
      issueType: "Task",
      ref: { displayId: "PROJ-10", title: "Task" },
    });
    const child = createTicket({
      id: "subtask-1",
      issueType: "Sub-task",
      ref: { displayId: "PROJ-11", title: "Follow-up for PROJ-10" },
    });

    const hierarchy = buildProjectTicketHierarchy([task, child]);

    expect(hierarchy.roots.map((ticket) => ticket.id)).toEqual([task.id]);
    expect(hierarchy.childrenByParentId.get(task.id)?.map((ticket) => ticket.id)).toEqual([
      child.id,
    ]);
    expect(hierarchy.parentByChildId.get(child.id)).toBe(task.id);
    expect(hierarchy.unresolvedChildren).toHaveLength(0);
  });
});
