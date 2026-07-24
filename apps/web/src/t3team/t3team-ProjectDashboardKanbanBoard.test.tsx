import { describe, expect, it } from "vite-plus/test";

import { createProjectBacklogTestTicket as createTicket } from "./t3team-projectBacklogTestUtils";
import { buildProjectDashboardKanbanMoveError } from "./t3team-ProjectDashboardKanbanBoard";

describe("ProjectDashboardKanbanBoard", () => {
  it("formats a visible error message when a Jira move is rejected", () => {
    const ticket = createTicket({
      id: "10024",
      ref: { displayId: "PROJ-24", title: "Move me" },
      status: "Accepted",
    });

    const moveError = buildProjectDashboardKanbanMoveError({
      ticket,
      targetStatus: "In Progress",
      error: new Error(
        "No Jira transition moves PROJ-24 into In Progress. Available transitions: Reopen.",
      ),
    });

    expect(moveError).toEqual({
      title: "Couldn't move PROJ-24 to In Progress",
      description:
        "No Jira transition moves PROJ-24 into In Progress. Available transitions: Reopen.",
    });
  });
});
