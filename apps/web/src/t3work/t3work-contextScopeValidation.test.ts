import { describe, expect, it } from "vite-plus/test";

import {
  assertContextRelativePathInProjectWorkspace,
  assertTicketKeyInProjectScope,
} from "~/t3work/t3work-contextScopeValidation";
import type { ProjectTicket } from "~/t3work/t3work-types";

function createTicket(key: string): ProjectTicket {
  return {
    id: key.toLowerCase(),
    projectId: "Project Alpha",
    ref: {
      provider: "atlassian",
      kind: "issue",
      id: key,
      displayId: key,
      title: `Ticket ${key}`,
      type: "Task",
      url: `https://example.test/browse/${key}`,
      projectId: "PROJ",
    },
    issueType: "Task",
    status: "In Progress",
    updatedAt: "2026-05-18T12:00:00.000Z",
  };
}

describe("assertTicketKeyInProjectScope", () => {
  it("accepts keys from the loaded project ticket list", () => {
    expect(
      assertTicketKeyInProjectScope({
        projectId: "Project Alpha",
        ticketKey: "PROJ-2",
        projectTickets: [createTicket("PROJ-1"), createTicket("PROJ-2")],
      }),
    ).toBe("PROJ-2");
  });

  it("rejects keys from another project backlog", () => {
    expect(() =>
      assertTicketKeyInProjectScope({
        projectId: "Project Alpha",
        ticketKey: "OTHER-9",
        projectTickets: [createTicket("PROJ-1")],
      }),
    ).toThrow("outside the current project scope");
  });
});

describe("assertContextRelativePathInProjectWorkspace", () => {
  it("rejects paths outside the managed context tree", () => {
    expect(() =>
      assertContextRelativePathInProjectWorkspace({
        projectId: "Project Alpha",
        relativePath: "../secrets.txt",
      }),
    ).toThrow("managed .t3work/context tree");
  });

  it("rejects jira cache paths for a different project id", () => {
    expect(() =>
      assertContextRelativePathInProjectWorkspace({
        projectId: "Project Alpha",
        relativePath: ".t3work/context/jira/other-project/items/proj-1/entrypoint.json",
      }),
    ).toThrow("current project cache");
  });
});
