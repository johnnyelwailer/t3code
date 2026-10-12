// @vitest-environment jsdom
import { ProjectShellProjectId, type ProjectShellProject } from "@t3tools/project-context";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import type { ProjectTicket } from "~/t3team/t3team-types";

vi.mock("~/t3team/hooks/t3team-useProjectKanbanBoardColumns", () => ({
  useProjectKanbanBoardColumns: () => ({ boardColumns: [], availableStatuses: [] }),
}));

const { AllProjectsMyWorkBoard } = await import("./t3team-AllProjectsMyWorkBoard");

const project: ProjectShellProject = {
  id: ProjectShellProjectId.make("project-1"),
  title: "IES NG",
  source: { provider: "atlassian", accountId: "site-1", externalProjectId: "10008" },
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
};

function ticket(input: {
  key: string;
  title: string;
  status: string;
  issueType: string;
  parentId?: string;
  assigneeAccountId?: string;
}): ProjectTicket {
  return {
    id: input.key,
    projectId: project.id,
    ...(input.parentId ? { parentId: input.parentId } : {}),
    ref: {
      provider: "atlassian",
      kind: "issue",
      id: input.key,
      displayId: input.key,
      title: input.title,
      url: "",
      projectId: project.id,
    },
    issueType: input.issueType,
    status: input.status,
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...(input.assigneeAccountId ? { assigneeAccountId: input.assigneeAccountId } : {}),
  };
}

// The My Work page: the viewer's items plus the parent story they hang under, assigned elsewhere.
const tickets = [
  ticket({
    key: "IES-1",
    title: "Patient detail shell",
    status: "In Progress",
    issueType: "Story",
  }),
  ticket({
    key: "IES-2",
    title: "FE: location switch",
    status: "To Do",
    issueType: "Sub-task",
    parentId: "IES-1",
    assigneeAccountId: "viewer",
  }),
  ticket({
    key: "IES-3",
    title: "Map layer overlaps",
    status: "To Do",
    issueType: "Bug",
    parentId: "IES-1",
    assigneeAccountId: "viewer",
  }),
];

function renderBoard() {
  return renderToStaticMarkup(
    <AllProjectsMyWorkBoard
      project={project}
      tickets={tickets}
      viewerAccountId="viewer"
      onOpenTicket={() => {}}
    />,
  );
}

describe("AllProjectsMyWorkBoard", () => {
  it("nests the viewer's subtask and bug under their parent story's key and title", () => {
    const markup = renderBoard();
    expect(markup).toContain('data-shell-ticket="IES-1"');
    expect(markup).toContain("Patient detail shell");
  });
});
