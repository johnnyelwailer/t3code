import { describe, expect, it } from "vite-plus/test";

import { createProjectBacklogTestTicket as createTicket } from "./t3team-projectBacklogTestUtils";
import { getProjectBacklogTableRowEstimateBaseline } from "./t3team-useProjectBacklogTableRowDraft";

describe("project backlog table row draft", () => {
  it("uses tracked hours as the estimate baseline when a subtask has no numeric estimate", () => {
    const ticket = createTicket({
      id: "subtask",
      issueType: "Task",
      issueTypeIsSubtask: true,
      timeOriginalEstimateSeconds: 86400,
    });

    expect(getProjectBacklogTableRowEstimateBaseline(ticket)).toBe("24");
  });
});
