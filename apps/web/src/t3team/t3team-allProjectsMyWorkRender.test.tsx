// @vitest-environment jsdom
/**
 * The regression this file exists for: the first version of this view composed
 * `ProjectDashboardMyWorkView` once per project. That component requires
 * `T3TeamDashboardRecipeActionProvider`, which only `AppDashboardPane` mounts — so with one or
 * more bound projects the whole route threw
 * "Dashboard recipe actions must be used inside T3TeamDashboardRecipeActionProvider."
 *
 * Nothing caught it: typecheck cannot see a runtime context throw, the unit tests only exercised
 * the pure helpers, and a manual browser pass hit the EMPTY state — which returns before rendering
 * any child. So the one case that matters is "render with at least one bound project".
 */
import { describe, expect, it, vi } from "vite-plus/test";
import { renderToStaticMarkup } from "react-dom/server";

const boundProject = {
  id: "project-1",
  title: "Nexplore Platform",
  source: {
    provider: "atlassian",
    accountId: "acct-1",
    externalProjectId: "ext-1",
    externalProjectKey: "NEX",
  },
};

vi.mock("~/t3team/hooks/t3team-useProjectStore", () => ({
  useProjectStore: () => ({ allProjects: [boundProject] }),
}));

// The digest lens reads the server-aggregated graph through the backend; a bare static render has
// no backend provider, so pin the hook to its initial loading state.
vi.mock("~/t3team/mywork-digest/t3team-useMyWorkDigestGraph", () => ({
  useMyWorkDigestGraph: () => ({
    graph: null,
    status: "loading",
    viewerUnresolved: false,
    reload: () => {},
  }),
}));

vi.mock("~/t3team/hooks/t3team-useProjectMyWork", () => ({
  useProjectMyWork: () => ({
    tickets: [
      {
        id: "ticket-1",
        displayId: "NEX-1",
        title: "Ship the thing",
        status: "In Progress",
        ref: { id: "ticket-1", title: "Ship the thing" },
      },
      {
        id: "ticket-2",
        displayId: "NEX-2",
        title: "Subtask of the thing",
        status: "To Do",
        parentId: "ticket-1",
        ref: { id: "ticket-2", title: "Subtask of the thing" },
      },
    ],
    loading: false,
    error: null,
    reload: () => {},
    lastCheckedAt: undefined,
  }),
}));

vi.mock("~/t3team/hooks/t3team-useProjectKanbanBoardColumns", () => ({
  useProjectKanbanBoardColumns: () => ({
    boardColumns: [],
    availableStatuses: [],
    loading: false,
    error: null,
    reload: () => {},
  }),
}));

// The all-projects view persists its lens under the "all" scope via the My Work state hook, which
// reads the ROUTE search through tanstack — unavailable in a bare static render, so pin the lens.
const lensMock: { lens: "digest" | "hierarchy" | "board" } = { lens: "hierarchy" };
vi.mock("~/t3team/t3team-projectDashboardMyWorkState", () => ({
  useProjectDashboardMyWorkState: () => ({
    state: { lens: lensMock.lens },
    setState: () => {},
  }),
}));

const { AllProjectsMyWorkView } = await import("~/t3team/t3team-AllProjectsMyWorkView");

describe("AllProjectsMyWorkView with a bound project", () => {
  it("renders without needing the dashboard pane's providers", () => {
    // Rendering AT ALL is the assertion: the previous version threw here, before producing markup.
    const markup = renderToStaticMarkup(<AllProjectsMyWorkView onOpenTicket={() => {}} />);
    expect(markup).toContain("Nexplore Platform");
    expect(markup).toContain("Ship the thing");
    // And it must NOT fall back to the empty state, which is what made the first version look fine.
    expect(markup).not.toContain("No projects are connected to a work source yet");
  });

  it("renders the digest lens switch and a digest body in the default lens", () => {
    lensMock.lens = "digest";
    const markup = renderToStaticMarkup(<AllProjectsMyWorkView onOpenTicket={() => {}} />);
    expect(markup).toContain("My Work view switch");
    // Effects never run in a static render, so the digest has not received its reports yet and
    // must show the loading state rather than the per-project sections.
    expect(markup).not.toContain("Ship the thing");
    lensMock.lens = "hierarchy";
  });

  it("renders the depth-indented tree in the hierarchy lens, not the flat list", () => {
    lensMock.lens = "hierarchy";
    const markup = renderToStaticMarkup(<AllProjectsMyWorkView onOpenTicket={() => {}} />);
    // Both parent and child render, and the child is indented under its parent.
    expect(markup).toContain("Ship the thing");
    expect(markup).toContain("Subtask of the thing");
    expect(markup).toContain("border-l-2 border-border/60 pl-3");
    expect(markup).not.toContain('class="divide-y divide-border/70');
  });

  it("renders the per-project kanban in the board lens — distinct from the hierarchy lens", () => {
    lensMock.lens = "board";
    const board = renderToStaticMarkup(<AllProjectsMyWorkView onOpenTicket={() => {}} />);
    expect(board).toContain("Ship the thing");
    expect(board).toContain("Subtask of the thing");
    // The kanban scrolls horizontally and drops the tree's indent border.
    expect(board).toContain("overflow-x-auto");
    expect(board).not.toContain("border-l-2 border-border/60 pl-3");

    lensMock.lens = "hierarchy";
    const hierarchy = renderToStaticMarkup(<AllProjectsMyWorkView onOpenTicket={() => {}} />);
    expect(board).not.toBe(hierarchy);
    lensMock.lens = "hierarchy";
  });
});
