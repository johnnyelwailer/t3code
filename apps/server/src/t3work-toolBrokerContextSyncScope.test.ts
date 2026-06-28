import { describe, expect, it } from "vitest";

import {
  normalizeTicketKey,
  parseWorkItemsIndex,
  readTicketKeyArg,
  readToolContextView,
} from "./t3work-toolBrokerContextSyncScope.ts";

describe("t3work-toolBrokerContextSyncScope", () => {
  it("reads ticket_key from tool args", () => {
    expect(readTicketKeyArg({ ticket_key: " proj-12 " })).toBe("proj-12");
    expect(readTicketKeyArg({ ticket_key: "" })).toBeUndefined();
    expect(readTicketKeyArg(null)).toBeUndefined();
  });

  it("normalizes ticket keys for comparison", () => {
    expect(normalizeTicketKey(" proj-1 ")).toBe("PROJ-1");
  });

  it("parses work-items index JSON", () => {
    expect(
      parseWorkItemsIndex(
        JSON.stringify({
          workItems: [{ key: "PROJ-1", availability: "summary" }],
        }),
      ),
    ).toEqual({
      workItems: [{ key: "PROJ-1", availability: "summary" }],
    });
    expect(parseWorkItemsIndex("not-json")).toBeUndefined();
  });

  it("reads project workspace from tool context view", () => {
    expect(
      readToolContextView({
        state: {
          view: {
            projectId: "project-1",
            workspaceRoot: "/tmp/workspace",
            ticketId: "PROJ-9",
          },
        },
      }),
    ).toEqual({
      projectId: "project-1",
      workspaceRoot: "/tmp/workspace",
      ticketId: "PROJ-9",
    });
  });
});
