import { describe, expect, it } from "vite-plus/test";

import {
  collectWorkItemTicketAliases,
  normalizeTicketKey,
  parseWorkItemsIndex,
  readBoundTicketKey,
  readTicketKeyArg,
  readToolContextView,
  readForceRefreshArg,
} from "./t3work-toolBrokerContextSyncScope.ts";

describe("t3work-toolBrokerContextSyncScope", () => {
  it("reads ticket_key from tool args", () => {
    expect(readTicketKeyArg({ ticket_key: " proj-12 " })).toBe("proj-12");
    expect(readTicketKeyArg({ ticket_key: "" })).toBeUndefined();
    expect(readTicketKeyArg(null)).toBeUndefined();
  });

  it("reads force refresh from tool args", () => {
    expect(readForceRefreshArg({ force: true })).toBe(true);
    expect(readForceRefreshArg({ force_refresh: true })).toBe(true);
    expect(readForceRefreshArg({ force: false })).toBe(false);
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
        surface: "t3work",
        tools: [],
        state: {
          view: {
            projectId: "project-1",
            workspaceRoot: "/tmp/workspace",
            ticketId: "10001",
            ticketDisplayId: "PROJ-9",
          },
        },
      }),
    ).toEqual({
      projectId: "project-1",
      workspaceRoot: "/tmp/workspace",
      ticketId: "10001",
      ticketDisplayId: "PROJ-9",
    });
  });

  it("prefers ticketDisplayId over numeric ticketId for bound work-item refresh", () => {
    expect(
      readBoundTicketKey({
        ticketId: "10001",
        ticketDisplayId: "PROJ-7",
      }),
    ).toBe("PROJ-7");
    expect(readBoundTicketKey({ ticketId: "10001" })).toBe("10001");
  });

  it("collects work-item ticket aliases from summary JSON", () => {
    expect(
      collectWorkItemTicketAliases({
        id: "10001",
        ref: { id: "10001", displayId: "PROJ-7" },
      }),
    ).toEqual(["10001", "PROJ-7"]);
  });
});
