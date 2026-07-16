import { describe, expect, it } from "vite-plus/test";
import {
  buildProjectBacklogAssigneeFilterOptions,
  buildProjectBacklogLabelFilterOptions,
  filterProjectBacklogTickets,
  getProjectBacklogIssueTypeFilterCategory,
  isProjectTicketHourTracked,
  isProjectTicketSubtask,
  resolveProjectBacklogAssigneeFilter,
  summarizeProjectBacklog,
} from "./t3work-projectBacklogUtils";
import { createProjectBacklogTestTicket as createTicket } from "./t3work-projectBacklogTestUtils";

describe("project backlog utils", () => {
  it("prioritizes unestimated and unassigned tickets in the filtered backlog", () => {
    const planned = createTicket({ id: "planned", assignee: "Alex", estimateValue: 3 });
    const needsPlan = createTicket({ id: "needs-plan" });

    expect(
      filterProjectBacklogTickets({
        tickets: [planned, needsPlan],
        query: "",
        focusFilter: "all",
      }).map((ticket) => ticket.id),
    ).toEqual(["needs-plan", "planned"]);
  });

  it("supports focused backlog slices and metrics", () => {
    const tickets = [
      createTicket({ id: "unassigned" }),
      createTicket({ id: "estimated", assignee: "Alex", estimateValue: 2, subtaskCount: 2 }),
    ];

    expect(
      filterProjectBacklogTickets({
        tickets,
        query: "",
        focusFilter: "with-subtasks",
      }).map((ticket) => ticket.id),
    ).toEqual(["estimated"]);

    expect(summarizeProjectBacklog(tickets)).toEqual({
      total: 2,
      needsPlan: 1,
      unassigned: 1,
      needsEstimate: 1,
      ready: 1,
      withSubtasks: 1,
    });
  });

  it("recognizes subtask issue types", () => {
    expect(isProjectTicketSubtask(createTicket({ id: "subtask", issueType: "Sub-task" }))).toBe(
      true,
    );
    expect(
      isProjectTicketSubtask(createTicket({ id: "custom-subtask", issueTypeIsSubtask: true })),
    ).toBe(true);
  });

  it("treats only subtasks and untyped time-tracked work as hour-tracked work", () => {
    expect(isProjectTicketHourTracked(createTicket({ id: "bug", issueType: "Bug" }))).toBe(false);
    expect(isProjectTicketHourTracked(createTicket({ id: "subtask", issueType: "Sub-task" }))).toBe(
      true,
    );
    expect(
      isProjectTicketHourTracked(
        createTicket({ id: "tracked", timeOriginalEstimateSeconds: 3600 }),
      ),
    ).toBe(true);
    expect(
      isProjectTicketHourTracked(
        createTicket({ id: "story", issueType: "Story", timeOriginalEstimateSeconds: 3600 }),
      ),
    ).toBe(false);
    expect(isProjectTicketHourTracked(createTicket({ id: "story", issueType: "Story" }))).toBe(
      false,
    );
  });

  it("matches backlog search against descriptions", () => {
    const tickets = [
      createTicket({ id: "alpha", description: "Coordinate release planning notes" }),
      createTicket({ id: "beta", description: "Backfill analytics tracking" }),
    ];

    expect(
      filterProjectBacklogTickets({
        tickets,
        query: "release planning",
        focusFilter: "all",
      }).map((ticket) => ticket.id),
    ).toEqual(["alpha"]);
  });

  it("matches backlog search against ancestor keys and titles", () => {
    const epic = createTicket({
      id: "epic",
      issueType: "Epic",
      ref: { displayId: "PROJ-10", title: "Checkout Revamp" },
    });
    const story = createTicket({
      id: "story",
      issueType: "Story",
      parentId: epic.id,
      ref: { displayId: "PROJ-11", title: "Improve cart summary" },
    });
    const subtask = createTicket({
      id: "subtask",
      issueType: "Sub-task",
      parentId: story.id,
      ref: { displayId: "PROJ-12", title: "Hook up CTA" },
    });

    expect(
      filterProjectBacklogTickets({
        tickets: [epic, story, subtask],
        query: "checkout revamp",
        focusFilter: "all",
      }).map((ticket) => ticket.id),
    ).toEqual(["epic", "story", "subtask"]);
    expect(
      filterProjectBacklogTickets({
        tickets: [epic, story, subtask],
        query: "PROJ-10",
        focusFilter: "all",
      }).map((ticket) => ticket.id),
    ).toEqual(["epic", "story", "subtask"]);
  });

  it("puts the preferred assignee first in filter options", () => {
    const tickets = [
      createTicket({ id: "alpha", assignee: "Alex", assigneeAccountId: "account-alex" }),
      createTicket({ id: "pj", assignee: "Philip Jonientz", assigneeAccountId: "account-pj" }),
      createTicket({ id: "zoe", assignee: "Zoe", assigneeAccountId: "account-zoe" }),
    ];

    expect(
      buildProjectBacklogAssigneeFilterOptions(tickets, "Philip Jonientz").map(
        (option) => option.label,
      ),
    ).toEqual(["All assignees", "Philip Jonientz", "Alex", "Zoe"]);
  });

  it("deduplicates assignee filter options when some tickets miss account ids", () => {
    const tickets = [
      createTicket({
        id: "pj-account",
        assignee: "Philip Jonientz",
        assigneeAccountId: "account-pj",
      }),
      createTicket({ id: "pj-name", assignee: "Philip Jonientz" }),
    ];

    expect(buildProjectBacklogAssigneeFilterOptions(tickets).map((option) => option.label)).toEqual(
      ["All assignees", "Philip Jonientz"],
    );
  });

  it("matches name-only tickets when filtering by an account-backed assignee", () => {
    const tickets = [
      createTicket({
        id: "pj-account",
        assignee: "Philip Jonientz",
        assigneeAccountId: "account-pj",
      }),
      createTicket({ id: "pj-name", assignee: "Philip Jonientz" }),
      createTicket({ id: "other", assignee: "Alex", assigneeAccountId: "account-alex" }),
    ];

    expect(
      filterProjectBacklogTickets({
        tickets,
        query: "",
        focusFilter: "all",
        assigneeFilter: "account:account-pj",
      }).map((ticket) => ticket.id),
    ).toEqual(["pj-account", "pj-name"]);
  });

  it("includes stories that have assigned subtasks for the selected assignee", () => {
    const story = createTicket({
      id: "story",
      issueType: "Story",
      assignee: "Blair",
      assigneeAccountId: "account-blair",
    });
    const mySubtask = createTicket({
      id: "my-subtask",
      issueType: "Sub-task",
      parentId: story.id,
      assignee: "Alex",
      assigneeAccountId: "account-alex",
    });
    const siblingSubtask = createTicket({
      id: "sibling-subtask",
      issueType: "Sub-task",
      parentId: story.id,
    });
    const otherStory = createTicket({
      id: "other-story",
      issueType: "Story",
      assignee: "Blair",
      assigneeAccountId: "account-blair",
    });

    const filteredIds = filterProjectBacklogTickets({
      tickets: [story, mySubtask, siblingSubtask, otherStory],
      query: "",
      focusFilter: "all",
      assigneeFilter: "account:account-alex",
    }).map((ticket) => ticket.id);

    expect(filteredIds).toEqual(expect.arrayContaining(["story", "my-subtask", "sibling-subtask"]));
    expect(filteredIds).toHaveLength(3);
  });

  it("keeps unassigned subtasks visible under a matched story by default", () => {
    const story = createTicket({
      id: "story",
      issueType: "Story",
      assignee: "Alex",
      assigneeAccountId: "account-alex",
      ref: { displayId: "PROJ-11", title: "Improve cart summary" },
    });
    const assignedSubtask = createTicket({
      id: "assigned-subtask",
      issueType: "Sub-task",
      parentId: story.id,
      assignee: "Blair",
      assigneeAccountId: "account-blair",
      ref: { displayId: "PROJ-12", title: "Hook up CTA" },
    });
    const unassignedSubtask = createTicket({
      id: "unassigned-subtask",
      issueType: "Sub-task",
      parentId: story.id,
      ref: { displayId: "PROJ-13", title: "Add analytics" },
    });
    const otherStory = createTicket({
      id: "other-story",
      issueType: "Story",
      assignee: "Blair",
      assigneeAccountId: "account-blair",
      ref: { displayId: "PROJ-21", title: "Other work" },
    });

    const filteredIds = filterProjectBacklogTickets({
      tickets: [story, assignedSubtask, unassignedSubtask, otherStory],
      query: "",
      focusFilter: "all",
      assigneeFilter: "account:account-alex",
    }).map((ticket) => ticket.id);

    expect(filteredIds).toEqual(
      expect.arrayContaining(["story", "assigned-subtask", "unassigned-subtask"]),
    );
    expect(filteredIds).toHaveLength(3);
  });

  it("can require subtasks to match the assignee filter directly", () => {
    const story = createTicket({
      id: "story",
      issueType: "Story",
      assignee: "Alex",
      assigneeAccountId: "account-alex",
    });
    const assignedSubtask = createTicket({
      id: "assigned-subtask",
      issueType: "Sub-task",
      parentId: story.id,
      assignee: "Alex",
      assigneeAccountId: "account-alex",
    });
    const otherAssigneeSubtask = createTicket({
      id: "other-assignee-subtask",
      issueType: "Sub-task",
      parentId: story.id,
      assignee: "Blair",
      assigneeAccountId: "account-blair",
    });
    const unassignedSubtask = createTicket({
      id: "unassigned-subtask",
      issueType: "Sub-task",
      parentId: story.id,
    });

    const filteredIds = filterProjectBacklogTickets({
      tickets: [story, assignedSubtask, otherAssigneeSubtask, unassignedSubtask],
      query: "",
      focusFilter: "all",
      assigneeFilter: "account:account-alex",
      assigneeFilterScope: { epic: false, story: true, subtask: true },
    }).map((ticket) => ticket.id);

    expect(filteredIds).toEqual(expect.arrayContaining(["story", "assigned-subtask"]));
    expect(filteredIds).toHaveLength(2);
  });

  it("filters visible issue type categories before hierarchy context is restored", () => {
    const epic = createTicket({ id: "epic", issueType: "Epic" });
    const story = createTicket({ id: "story", issueType: "Story", parentId: epic.id });
    const subtask = createTicket({
      id: "subtask",
      issueType: "Sub-task",
      parentId: story.id,
    });

    expect([epic, story, subtask].map(getProjectBacklogIssueTypeFilterCategory)).toEqual([
      "epic",
      "standard",
      "subtask",
    ]);
    expect(
      filterProjectBacklogTickets({
        tickets: [epic, story, subtask],
        query: "",
        focusFilter: "all",
        visibleIssueTypes: ["standard", "subtask"],
      }).map((ticket) => ticket.id),
    ).toEqual(["story", "subtask"]);
  });

  it("builds sorted label filter options with per-label counts", () => {
    const tickets = [
      createTicket({ id: "alpha", labels: ["backend", "urgent"] }),
      createTicket({ id: "beta", labels: ["backend"] }),
      createTicket({ id: "gamma" }),
    ];

    expect(buildProjectBacklogLabelFilterOptions(tickets)).toEqual([
      { value: "backend", count: 2 },
      { value: "urgent", count: 1 },
    ]);
  });

  it("matches tickets that carry at least one selected label (OR semantics)", () => {
    const backend = createTicket({ id: "backend-only", labels: ["backend"] });
    const urgent = createTicket({ id: "urgent-only", labels: ["urgent"] });
    const both = createTicket({ id: "both", labels: ["backend", "urgent"] });
    const neither = createTicket({ id: "neither", labels: ["design"] });
    const unlabeled = createTicket({ id: "unlabeled" });

    const filteredIds = filterProjectBacklogTickets({
      tickets: [backend, urgent, both, neither, unlabeled],
      query: "",
      focusFilter: "all",
      selectedLabels: ["backend", "urgent"],
    }).map((ticket) => ticket.id);

    expect(filteredIds).toEqual(expect.arrayContaining(["backend-only", "urgent-only", "both"]));
    expect(filteredIds).toHaveLength(3);
  });

  it("excludes tickets without labels when any label is selected", () => {
    const labeled = createTicket({ id: "labeled", labels: ["backend"] });
    const unlabeled = createTicket({ id: "unlabeled" });

    expect(
      filterProjectBacklogTickets({
        tickets: [labeled, unlabeled],
        query: "",
        focusFilter: "all",
        selectedLabels: ["backend"],
      }).map((ticket) => ticket.id),
    ).toEqual(["labeled"]);
  });

  it("applies no label filter when no labels are selected", () => {
    const labeled = createTicket({ id: "labeled", labels: ["backend"] });
    const unlabeled = createTicket({ id: "unlabeled" });

    expect(
      filterProjectBacklogTickets({
        tickets: [labeled, unlabeled],
        query: "",
        focusFilter: "all",
        selectedLabels: [],
      }).map((ticket) => ticket.id),
    ).toEqual(expect.arrayContaining(["labeled", "unlabeled"]));
  });

  it("treats unavailable assignee filters as all assignees", () => {
    const tickets = [
      createTicket({ id: "alpha", assignee: "Alex", assigneeAccountId: "account-alex" }),
      createTicket({ id: "zoe", assignee: "Zoe", assigneeAccountId: "account-zoe" }),
    ];

    expect(resolveProjectBacklogAssigneeFilter(tickets, "account:stale-user")).toBe("__all__");
    expect(resolveProjectBacklogAssigneeFilter(tickets, "account:account-alex")).toBe(
      "account:account-alex",
    );
    expect(
      filterProjectBacklogTickets({
        tickets,
        query: "",
        focusFilter: "all",
        assigneeFilter: "account:stale-user",
      }).map((ticket) => ticket.id),
    ).toEqual(["alpha", "zoe"]);
  });
});
