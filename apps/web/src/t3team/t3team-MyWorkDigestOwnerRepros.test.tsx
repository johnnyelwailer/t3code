// @vitest-environment jsdom
/**
 * Owner repros #480 — view-level regression tests.
 *
 * Repro 4: a per-project digest that never settles (the owner saw "arranging · 2 h" with an
 * empty "0 NEW SINCE ARRANGEMENT" section). A scope with no items is a well-formed answer, and
 * the view must surface the proper empty state plus the readable "auto · updated" data-source
 * status instead of a vague in-progress verb.
 *
 * Repro 5: the third lens must not be a copy of the second. The Hierarchy lens renders the
 * depth-indented parent/child tree; the Board lens renders the kanban; the two markups are
 * distinct.
 */
import { describe, expect, it, vi } from "vite-plus/test";
import { renderToStaticMarkup } from "react-dom/server";
import type * as React from "react";

vi.mock("~/t3team/hooks/t3team-useTicketAgentContext", () => ({
  useTicketAgentContext: () => ({
    getTicketAgentContext: () => null,
    openTicketAgentContextMenu: () => {},
  }),
}));

const { ProjectMyWorkDigestView } = await import("~/t3team/t3team-ProjectMyWorkDigestView");
const { ProjectMyWorkContent } = await import("~/t3team/t3team-ProjectMyWorkContent");
const { buildHeuristicDigestPlan, resolveDigestPlan } =
  await import("~/t3team/t3team-projectMyWorkDigestPlan");
const { iesGraphWithoutSprint, DIGEST_FIXTURE_NOW_MS, HOUR } =
  await import("~/t3team/t3team-projectMyWorkDigestFixtures");
const { buildProjectMyWorkVisibleHierarchy } = await import("~/t3team/t3team-projectMyWork");
const { buildProjectTicketKanbanColumns } = await import("~/t3team/t3team-projectTicketStatus");
const { buildProjectTicketHierarchy } = await import("~/t3team/t3team-ticketHierarchy");
import { createProjectBacklogTestTicket } from "~/t3team/t3team-projectBacklogTestUtils";
import type { ProjectShellProject } from "@t3tools/project-context";

const NOW = DIGEST_FIXTURE_NOW_MS;

const STORY_PROJECT = {
  id: "project-1",
  title: "Nexplore Platform",
  source: { provider: "atlassian", accountId: "acct-1", externalProjectId: "ext-1", raw: {} },
} as unknown as ProjectShellProject;

describe("owner repro 4 — digest states surface properly", () => {
  it("shows the readable 'auto · updated' data-source status, not a stuck verb", () => {
    const plan = resolveDigestPlan(
      buildHeuristicDigestPlan(iesGraphWithoutSprint, NOW),
      iesGraphWithoutSprint,
      NOW,
    );
    const markup = renderToStaticMarkup(
      <ProjectMyWorkDigestView
        plan={plan}
        graph={iesGraphWithoutSprint}
        nowMs={NOW}
        updatedAtMs={NOW - 2 * HOUR}
      />,
    );
    expect(markup).toContain("auto · updated 2 h ago");
    expect(markup).not.toContain("arranging");
  });

  it("renders the 'Nothing needs you' state for a scope where the user has no items", () => {
    const emptyGraph = {
      ...iesGraphWithoutSprint,
      tickets: [],
      claims: [],
      decisions: [],
      changeRequests: [],
      transitions: [],
      blockers: [],
    };
    const plan = resolveDigestPlan(buildHeuristicDigestPlan(emptyGraph, NOW), emptyGraph, NOW);
    const markup = renderToStaticMarkup(
      <ProjectMyWorkDigestView
        plan={plan}
        graph={emptyGraph}
        nowMs={NOW}
        updatedAtMs={NOW - HOUR}
      />,
    );
    expect(markup).toContain("Nothing needs you");
    expect(markup).toContain("auto · updated");
    expect(markup).toContain("Nothing needs you");
  });
});

type ContentProps = React.ComponentProps<typeof ProjectMyWorkContent>;

function contentProps(overrides: { lens: "digest" | "hierarchy" | "board" }): ContentProps {
  const tickets = [
    createProjectBacklogTestTicket({
      id: "epic-1",
      status: "In Progress",
      assignee: "Philip",
      updatedAt: "2026-09-14T08:00:00.000Z",
      ref: { displayId: "NEX-1", title: "Epical thing" },
    }),
    createProjectBacklogTestTicket({
      id: "sub-2",
      status: "To Do",
      assignee: "Philip",
      parentId: "epic-1",
      updatedAt: "2026-09-14T09:00:00.000Z",
      ref: { displayId: "NEX-2", title: "Subtask of the epic" },
    }),
    createProjectBacklogTestTicket({
      id: "task-3",
      status: "In Progress",
      assignee: "Philip",
      updatedAt: "2026-09-13T08:00:00.000Z",
      ref: { displayId: "NEX-3", title: "Standalone task" },
    }),
  ];
  const visibleHierarchy = buildProjectMyWorkVisibleHierarchy(tickets, tickets, {
    sortBy: "updated",
    sortDirection: "asc",
  });
  return {
    loading: false,
    project: STORY_PROJECT,
    tickets,
    assignedWorkItems: tickets,
    filteredWorkItems: tickets,
    visibleHierarchy,
    onLensChange: () => {},
    viewMode: "list" as const,
    groupMode: "flat" as const,
    tableSortBy: "updated" as const,
    tableSortDirection: "asc" as const,
    kanbanColumns: buildProjectTicketKanbanColumns(tickets),
    parentChildGroups: buildProjectTicketHierarchy(tickets),
    githubActivityByWorkItem: new Map(),
    onTableSortByChange: () => {},
    onTableSortDirectionChange: () => {},
    onOpenTicket: () => {},
    ...overrides,
  };
}

describe("owner repro 5 — the three lenses are distinct", () => {
  it("hierarchy lens renders the depth-indented tree even when legacy state says list", () => {
    const markup = renderToStaticMarkup(
      <ProjectMyWorkContent {...contentProps({ lens: "hierarchy" })} />,
    );
    // The tree indents children with a left border; the flat list does not.
    expect(markup).toContain("border-l-2 border-border/60 pl-3");
    expect(markup).toContain("Subtask of the epic");
    expect(markup).not.toContain('class="divide-y divide-border/70');
  });

  it("board lens renders the kanban, not the flat list", () => {
    const markup = renderToStaticMarkup(
      <ProjectMyWorkContent {...contentProps({ lens: "board" })} />,
    );
    expect(markup).toContain("overflow-x-auto");
    expect(markup).not.toContain('class="divide-y divide-border/70');
    expect(markup).not.toContain("border-l-2 border-border/60 pl-3");
  });

  it("the two non-digest lenses produce different markup", () => {
    const hierarchy = renderToStaticMarkup(
      <ProjectMyWorkContent {...contentProps({ lens: "hierarchy" })} />,
    );
    const board = renderToStaticMarkup(
      <ProjectMyWorkContent {...contentProps({ lens: "board" })} />,
    );
    expect(hierarchy).not.toBe(board);
  });
});
