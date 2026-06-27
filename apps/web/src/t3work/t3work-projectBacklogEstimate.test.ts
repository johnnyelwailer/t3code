import { describe, expect, it } from "vite-plus/test";

import { getProjectTicketEstimatePresentation } from "./t3work-projectBacklogEstimate";
import { createProjectBacklogTestTicket as createTicket } from "./t3work-projectBacklogTestUtils";

describe("project backlog estimate", () => {
  it("renders active sprint stories as readonly points with hour context", () => {
    expect(
      getProjectTicketEstimatePresentation(
        createTicket({
          id: "story",
          issueType: "Story",
          estimateValue: 6,
          sprintState: "active",
          timeOriginalEstimateSeconds: 0,
          aggregateTimeOriginalEstimateSeconds: 122400,
          aggregateTimeRemainingEstimateSeconds: 122400,
        }),
      ),
    ).toEqual({
      label: "Story Points",
      editable: false,
      numericValue: 6,
      valueText: "4.3/6",
      valueSuffix: "SP",
      tooltip: {
        title: "Derived from remaining tracked hours",
        formula: "34h remaining / 8h per SP = 4.3 SP",
        detailRows: [
          { label: "Original story points", value: "6 SP" },
          { label: "Remaining tracked estimate", value: "34h" },
          { label: "Tracked estimate total", value: "34h" },
          { label: "Hours on story itself", value: "0h" },
        ],
        note: "The left value updates from remaining tracked hours. The right value stays the original story points estimate.",
      },
      tooltipText:
        "4.3 SP is derived from the remaining hour estimate across this story and its subtasks using 8h per SP. Original story points: 6 SP. Remaining tracked estimate: 34h of 34h. Hours estimated directly on the story: 0h.",
    });
  });

  it("keeps active sprint stories editable when there is no derived hour context yet", () => {
    expect(
      getProjectTicketEstimatePresentation(
        createTicket({
          id: "story",
          issueType: "Story",
          estimateValue: 5,
          sprintState: "active",
        }),
      ),
    ).toEqual({
      label: "Story Points",
      editable: true,
      numericValue: 5,
      valueText: "5",
      valueSuffix: "SP",
    });
  });

  it("renders bug estimates in story points", () => {
    expect(
      getProjectTicketEstimatePresentation(
        createTicket({ id: "bug", issueType: "Bug", estimateValue: 1.5 }),
      ),
    ).toEqual({
      label: "Story Points",
      editable: true,
      numericValue: 1.5,
      valueText: "1.5",
      valueSuffix: "SP",
    });
  });

  it("renders subtask hours from tracked time when the numeric estimate is missing", () => {
    expect(
      getProjectTicketEstimatePresentation(
        createTicket({
          id: "subtask",
          issueType: "Task",
          issueTypeIsSubtask: true,
          timeOriginalEstimateSeconds: 86400,
        }),
      ),
    ).toEqual({
      label: "Hours",
      editable: true,
      numericValue: 24,
      valueText: "24",
      valueSuffix: "H",
    });
  });
});
