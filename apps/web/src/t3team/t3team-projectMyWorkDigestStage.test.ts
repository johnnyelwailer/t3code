import { describe, expect, it } from "vite-plus/test";

import { getProjectTicketKanbanLane } from "./t3team-projectTicketStatus";
import {
  getDigestTicketStage,
  isDigestStageHandedOn,
  isDigestStageInDevelopment,
} from "./t3team-projectMyWorkDigestStage";

describe("getDigestTicketStage", () => {
  it("splits the kanban's review lane into code review and test", () => {
    expect(getDigestTicketStage("Code Review")).toBe("review");
    expect(getDigestTicketStage("In Review")).toBe("review");
    expect(getDigestTicketStage("In Test")).toBe("test");
    expect(getDigestTicketStage("Ready for QA")).toBe("test");
    expect(getDigestTicketStage("UAT")).toBe("test");
    // The kanban keeps one review lane for both.
    expect(getProjectTicketKanbanLane("In Test")).toBe("review");
    expect(getProjectTicketKanbanLane("Code Review")).toBe("review");
  });

  it("keeps the other lanes as the kanban has them", () => {
    expect(getDigestTicketStage("To Do")).toBe("todo");
    expect(getDigestTicketStage("In Progress")).toBe("inProgress");
    expect(getDigestTicketStage("Done")).toBe("done");
    expect(getDigestTicketStage("")).toBe("todo");
  });

  it("tells work in development from work handed on", () => {
    expect(isDigestStageInDevelopment("inProgress")).toBe(true);
    expect(isDigestStageInDevelopment("test")).toBe(false);
    expect(isDigestStageHandedOn("review")).toBe(true);
    expect(isDigestStageHandedOn("test")).toBe(true);
    expect(isDigestStageHandedOn("done")).toBe(false);
  });
});
