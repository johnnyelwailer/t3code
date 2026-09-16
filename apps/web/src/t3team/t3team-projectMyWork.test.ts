/* oxlint-disable eslint/no-unused-vars -- Existing merged lint debt; keep green while preserving behavior. */
import { describe, expect, it } from "vite-plus/test";

import { createProjectBacklogTestTicket as createTicket } from "./t3team-projectBacklogTestUtils";
import {
  buildProjectMyWorkTypeOptions,
  buildProjectMyWorkVisibleHierarchy,
  filterDigestTickets,
  filterProjectMyWorkTickets,
  isProjectMyWorkEpic,
  isProjectMyWorkTicket,
} from "./t3team-projectMyWork";

describe("project my work", () => {
  it("matches tickets assigned to the current user by account or display name", () => {
    const identity = { accountId: "account-pj", displayName: "Philip Jonientz" };

    expect(
      isProjectMyWorkTicket(
        createTicket({ id: "account", assignee: "Someone Else", assigneeAccountId: "account-pj" }),
        identity,
      ),
    ).toBe(true);
    expect(
      isProjectMyWorkTicket(createTicket({ id: "name", assignee: "Philip Jonientz" }), {
        displayName: identity.displayName,
      }),
    ).toBe(true);
    expect(isProjectMyWorkTicket(createTicket({ id: "other", assignee: "Alex" }), identity)).toBe(
      false,
    );
  });

  it("filters my-work tickets by hidden types and ancestor-aware search", () => {
    const epic = createTicket({
      id: "epic",
      issueType: "Epic",
      ref: { displayId: "PROJ-10", title: "Checkout Revamp" },
      assignee: "Alex",
    });
    const subtask = createTicket({
      id: "subtask",
      issueType: "Sub-task",
      parentId: epic.id,
      ref: { displayId: "PROJ-11", title: "Hook up CTA" },
      assignee: "Philip Jonientz",
    });

    expect(
      filterProjectMyWorkTickets({
        tickets: [epic, subtask],
        identity: { displayName: "Philip Jonientz" },
        query: "checkout revamp",
        statusCategory: "all",
        excludedTypeKeys: [],
        selectedPriority: "all",
        selectedStatus: "all",
      }).map((ticket) => ticket.id),
    ).toEqual(["subtask"]);

    expect(
      filterProjectMyWorkTickets({
        tickets: [epic, subtask],
        identity: { displayName: "Philip Jonientz" },
        query: "",
        statusCategory: "all",
        excludedTypeKeys: ["sub-task"],
        selectedPriority: "all",
        selectedStatus: "all",
      }),
    ).toEqual([]);
  });

  it("keeps assigned subtasks visible through the full ancestor chain", () => {
    const epic = createTicket({
      id: "epic",
      issueType: "Epic",
      ref: { displayId: "PROJ-1", title: "Epic" },
      assignee: "Alex",
    });
    const story = createTicket({
      id: "story",
      issueType: "Story",
      parentId: epic.id,
      ref: { displayId: "PROJ-2", title: "Story" },
      assignee: "Alex",
    });
    const subtask = createTicket({
      id: "subtask",
      issueType: "Sub-task",
      parentId: story.id,
      ref: { displayId: "PROJ-3", title: "Subtask" },
      assignee: "Philip Jonientz",
    });

    const filteredTickets = filterProjectMyWorkTickets({
      tickets: [epic, story, subtask],
      identity: { displayName: "Philip Jonientz" },
      query: "",
      statusCategory: "all",
      excludedTypeKeys: [],
      selectedPriority: "all",
      selectedStatus: "all",
    });
    const hierarchy = buildProjectMyWorkVisibleHierarchy([epic, story, subtask], filteredTickets, {
      sortBy: "updated",
      sortDirection: "desc",
      excludedVisibleTypeKeys: [],
    });

    expect(hierarchy.visibleTickets.map((ticket) => ticket.id)).toEqual([
      "epic",
      "story",
      "subtask",
    ]);
    expect(
      hierarchy.rows.map((row) => ({
        id: row.ticket.id,
        depth: row.depth,
        isContextOnly: row.isContextOnly,
      })),
    ).toEqual([
      { id: "epic", depth: 0, isContextOnly: true },
      { id: "story", depth: 1, isContextOnly: true },
      { id: "subtask", depth: 2, isContextOnly: false },
    ]);
  });

  it("can hide epic context while keeping assigned descendants visible", () => {
    const epic = createTicket({
      id: "epic",
      issueType: "Epic",
      ref: { displayId: "PROJ-1", title: "Epic" },
      assignee: "Alex",
    });
    const story = createTicket({
      id: "story",
      issueType: "Story",
      parentId: epic.id,
      ref: { displayId: "PROJ-2", title: "Story" },
      assignee: "Philip Jonientz",
    });

    const filteredTickets = filterProjectMyWorkTickets({
      tickets: [epic, story],
      identity: { displayName: "Philip Jonientz" },
      query: "",
      statusCategory: "all",
      excludedTypeKeys: [],
      selectedPriority: "all",
      selectedStatus: "all",
    });
    const hierarchy = buildProjectMyWorkVisibleHierarchy([epic, story], filteredTickets, {
      sortBy: "updated",
      sortDirection: "desc",
      excludedVisibleTypeKeys: ["epic"],
    });

    expect(hierarchy.visibleTickets.map((ticket) => ticket.id)).toEqual(["story"]);
    expect(
      hierarchy.rows.map((row) => ({
        id: row.ticket.id,
        depth: row.depth,
        isContextOnly: row.isContextOnly,
      })),
    ).toEqual([{ id: "story", depth: 0, isContextOnly: false }]);
  });

  it("rebuilds visible context counts after hidden child types are pruned", () => {
    const story = createTicket({
      id: "story",
      issueType: "Story",
      ref: { displayId: "PROJ-2", title: "Story" },
      assignee: "Philip Jonientz",
    });
    const subtask = createTicket({
      id: "subtask",
      issueType: "Sub-task",
      parentId: story.id,
      ref: { displayId: "PROJ-3", title: "Subtask" },
      assignee: "Philip Jonientz",
    });

    const filteredTickets = filterProjectMyWorkTickets({
      tickets: [story, subtask],
      identity: { displayName: "Philip Jonientz" },
      query: "",
      statusCategory: "all",
      excludedTypeKeys: [],
      selectedPriority: "all",
      selectedStatus: "all",
    });
    const hierarchy = buildProjectMyWorkVisibleHierarchy([story, subtask], filteredTickets, {
      sortBy: "updated",
      sortDirection: "desc",
      excludedVisibleTypeKeys: ["sub-task"],
    });

    expect(hierarchy.visibleTickets.map((ticket) => ticket.id)).toEqual(["story"]);
    expect(hierarchy.contextByTicketId.get("story")?.directChildren).toEqual([]);
  });

  it("filters digest tickets by the user-selected filters without the assigned-to-me pre-filter", () => {
    const assigned = createTicket({
      id: "assigned",
      ref: { displayId: "PROJ-1", title: "Do the thing" },
      assignee: "Philip Jonientz",
      status: "In Progress",
      priority: "High",
    });
    // Not assigned to the viewer: the legacy filter would drop it, but the digest keeps it
    // because it is part of the viewer's work graph (agent claim, decision, or PR).
    const claimedByAgent = createTicket({
      id: "claimed",
      issueType: "Story",
      ref: { displayId: "PROJ-2", title: "Agent is working" },
      assignee: "Alex",
      status: "In Progress",
    });
    const epic = createTicket({
      id: "epic",
      issueType: "Epic",
      ref: { displayId: "PROJ-3", title: "Big Epic" },
      assignee: "Philip Jonientz",
      status: "To Do",
    });

    const all = {
      query: "",
      statusCategory: "all" as const,
      excludedTypeKeys: [],
      selectedPriority: "all",
      selectedStatus: "all",
    };

    // No filters: both rows survive even though one is not assigned to the viewer.
    expect(
      filterDigestTickets({ tickets: [assigned, claimedByAgent, epic], ...all }).map((t) => t.id),
    ).toEqual(["assigned", "claimed", "epic"]);

    // Hidden types still apply to the digest.
    expect(
      filterDigestTickets({
        tickets: [assigned, claimedByAgent, epic],
        ...all,
        excludedTypeKeys: ["epic"],
      }).map((t) => t.id),
    ).toEqual(["assigned", "claimed"]);

    // Search applies to title/key, independent of assignment.
    expect(
      filterDigestTickets({ tickets: [assigned, claimedByAgent], ...all, query: "agent" }).map(
        (t) => t.id,
      ),
    ).toEqual(["claimed"]);

    // Priority and status narrow exactly like the legacy lenses.
    expect(
      filterDigestTickets({
        tickets: [assigned, claimedByAgent],
        ...all,
        selectedPriority: "High",
      }).map((t) => t.id),
    ).toEqual(["assigned"]);
    expect(
      filterDigestTickets({ tickets: [assigned, epic], ...all, selectedStatus: "To Do" }).map(
        (t) => t.id,
      ),
    ).toEqual(["epic"]);

    // Ordering is left to the caller: input order is preserved.
    expect(filterDigestTickets({ tickets: [epic, assigned], ...all }).map((t) => t.id)).toEqual([
      "epic",
      "assigned",
    ]);
  });
});
