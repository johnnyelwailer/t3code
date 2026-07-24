import type { ProjectShellProject, ResourceSnapshot } from "@t3tools/project-context";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const integrationCacheHarness = vi.hoisted(() => ({
  readIntegrationCache: vi.fn(),
  writeIntegrationCache: vi.fn(),
}));

vi.mock("~/t3team/hooks/t3team-integrationCache", () => ({
  readIntegrationCache: integrationCacheHarness.readIntegrationCache,
  writeIntegrationCache: integrationCacheHarness.writeIntegrationCache,
}));

import type { BackendApi } from "~/t3team/backend/t3team-types";
import { buildTicketContextGraph } from "~/t3team/t3team-ticketContextGraph";
import type { ProjectTicket } from "~/t3team/t3team-types";

function createProject(): ProjectShellProject {
  return {
    id: "Project Alpha" as ProjectShellProject["id"],
    title: "Project Alpha",
    source: {
      provider: "atlassian",
      accountId: "acct-1",
      externalProjectId: "proj-1",
      externalProjectKey: "PROJ",
    },
    workspace: {
      rootPath: "/tmp/project-alpha",
      createdAt: "2026-05-18T00:00:00.000Z",
    },
    createdAt: "2026-05-18T00:00:00.000Z",
    updatedAt: "2026-05-18T00:00:00.000Z",
  };
}

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

beforeEach(() => {
  integrationCacheHarness.readIntegrationCache.mockReset();
  integrationCacheHarness.readIntegrationCache.mockReturnValue(null);
  integrationCacheHarness.writeIntegrationCache.mockReset();
});

describe("buildTicketContextGraph focused scope", () => {
  it("does not recursively expand reference branches beyond the direct focused slice", async () => {
    const project = createProject();
    const rootTicket = createTicket("PROJ-7");
    const localChild = createTicket("PROJ-8");
    const snapshots = new Map<string, ResourceSnapshot>([
      [
        "PROJ-7",
        {
          ref: {
            provider: "atlassian",
            kind: "issue",
            id: "PROJ-7",
            displayId: "PROJ-7",
            title: "Ticket PROJ-7",
            projectId: "PROJ",
            updatedAt: "2026-05-18T12:00:00.000Z",
          },
          fetchedAt: "2026-05-18T12:34:56.000Z",
          fields: {},
          raw: {
            fields: {
              subtasks: [{ key: "PROJ-8" }],
              issuelinks: [{ outwardIssue: { key: "PROJ-9" } }],
            },
          },
        },
      ],
      [
        "PROJ-9",
        {
          ref: {
            provider: "atlassian",
            kind: "issue",
            id: "PROJ-9",
            displayId: "PROJ-9",
            title: "Ticket PROJ-9",
            projectId: "PROJ",
            updatedAt: "2026-05-18T12:00:00.000Z",
          },
          fetchedAt: "2026-05-18T12:34:56.000Z",
          fields: {},
          raw: {
            fields: {
              issuelinks: [{ outwardIssue: { key: "PROJ-10" } }],
            },
          },
        },
      ],
    ]);
    const backend = {
      atlassian: {
        getResource: vi.fn(async (input: { ref: { id: string } }) => snapshots.get(input.ref.id)!),
      },
    } as unknown as BackendApi;

    const graph = await buildTicketContextGraph({
      backend,
      project,
      ticket: rootTicket,
      projectTickets: [rootTicket, localChild],
    });

    expect([...graph.nodes.keys()]).toEqual(["PROJ-7", "PROJ-8", "PROJ-9"]);
    expect(backend.atlassian.getResource).toHaveBeenCalledTimes(2);
  });
});
