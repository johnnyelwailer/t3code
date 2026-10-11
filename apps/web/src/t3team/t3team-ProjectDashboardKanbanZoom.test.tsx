// @vitest-environment jsdom
/**
 * Per-snap rendering of the flat My Work kanban board driven by continuous visual progress
 * pinned at each snap (no onChange → no gesture; progress derives from the level prop).
 */
import { describe, expect, it, vi } from "vite-plus/test";
import { renderToStaticMarkup } from "react-dom/server";

import { createProjectBacklogTestTicket as createTicket } from "./t3team-projectBacklogTestUtils";
import { ProjectDashboardKanbanBoard } from "./t3team-ProjectDashboardKanbanBoard";

const flags = vi.hoisted(() => ({ enabled: true }));
vi.mock("~/t3team/t3team-useKanbanSemanticZoomFlag", () => ({
  useKanbanSemanticZoomFlag: () => flags.enabled,
}));

const noop = () => {};
const hierarchy = { roots: [], unresolvedChildren: [], childrenByParentId: new Map() };
const columns = [
  {
    id: "in-test",
    title: "In Testing",
    items: [
      createTicket({
        id: "ticket-42",
        ref: { displayId: "NEX-42", title: "Ship the semantic zoom for the whole board" },
        status: "In Progress",
        priority: "High",
        assignee: "Ada Lovelace",
        subtaskCount: 3,
      }),
    ],
  },
  { id: "shipped", title: "Shipped", items: [] },
];

function renderBoard(kanbanZoomLevel?: "full" | "compact" | "at-a-glance") {
  return renderToStaticMarkup(
    <ProjectDashboardKanbanBoard
      kanbanColumns={columns}
      isHierarchyMode={false}
      parentChildGroups={hierarchy}
      projectId="project-1"
      onOpenTicket={noop}
      onTicketContextMenu={noop}
      {...(kanbanZoomLevel !== undefined ? { kanbanZoomLevel } : {})}
    />,
  );
}

describe("flat kanban board semantic zoom", () => {
  it("full (the default) renders the legacy layout byte for byte", () => {
    const markup = renderBoard();
    expect(markup).toContain("minmax(17rem, 1fr)");
    expect(markup).toContain("min-width:17rem");
    expect(markup).toContain("In Testing");
    expect(markup).toContain("Assigned to Ada Lovelace");
    expect(markup).toContain(">High<");
    expect(markup).toContain("Updated");
  });

  it("compact narrows the lanes and shows avatar instead of assignee name", () => {
    const markup = renderBoard("compact");
    expect(markup).toContain("minmax(11rem, 1fr)");
    expect(markup).toContain("min-width:11rem");
    expect(markup).toContain("In Testing");
    expect(markup).toContain("NEX-42");
    expect(markup).not.toContain("Assigned to");
    expect(markup).toContain(">AL<");
  });

  it("at-a-glance keeps lane names, type icon, ticket key, and a smaller title + avatar", () => {
    const markup = renderBoard("at-a-glance");
    expect(markup).toContain("minmax(6.75rem, 1fr)");
    expect(markup).toContain("min-width:6.75rem");
    expect(markup).toContain("In Testing");
    expect(markup).toContain("Shipped");
    expect(markup).toContain("Ship the semantic zoom for the whole board");
    expect(markup).toContain("NEX-42");
    expect(markup).toContain(">AL<");
    expect(markup).not.toContain("Assigned to");
    expect(markup).not.toContain("3 child items");
  });

  it("renders full even when a persisted zoom level is set but the server flag is off", () => {
    flags.enabled = false;
    try {
      const markup = renderBoard("at-a-glance");
      expect(markup).toContain("minmax(17rem, 1fr)");
      expect(markup).toContain("Assigned to Ada Lovelace");
    } finally {
      flags.enabled = true;
    }
  });

  it("applies zoom lane widths in hierarchy/matrix mode", () => {
    flags.enabled = true;
    const hierarchyMarkup = renderToStaticMarkup(
      <ProjectDashboardKanbanBoard
        kanbanColumns={columns}
        isHierarchyMode
        parentChildGroups={hierarchy}
        projectId="project-1"
        onOpenTicket={noop}
        onTicketContextMenu={noop}
        kanbanZoomLevel="at-a-glance"
      />,
    );
    // Matrix places cards via hierarchy layout; this fixture asserts lane geometry zooms
    // (including the grid track minmax — the prior 17rem hardcode).
    expect(hierarchyMarkup).toContain("minmax(6.75rem, 1fr)");
    expect(hierarchyMarkup).toContain("min-width:6.75rem");
  });
});
