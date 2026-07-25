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
import { TICKET_CONTEXT_GRAPH_LIMITS } from "~/t3team/t3team-ticketContextGraphSelection";
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

function createSnapshot(key: string): ResourceSnapshot {
  return {
    ref: {
      provider: "atlassian",
      kind: "issue",
      id: key,
      displayId: key,
      title: `Ticket ${key}`,
      projectId: "PROJ",
      updatedAt: "2026-05-18T12:00:00.000Z",
    },
    fetchedAt: "2026-05-18T12:34:56.000Z",
    fields: {},
    raw: {
      fields: {},
    },
  };
}

beforeEach(() => {
  integrationCacheHarness.readIntegrationCache.mockReset();
  integrationCacheHarness.writeIntegrationCache.mockReset();
});

describe("buildTicketContextGraph cache reuse", () => {
  it("reuses cached snapshots instead of refetching them", async () => {
    const project = createProject();
    const rootTicket = createTicket("PROJ-7");
    const cachedSnapshot = createSnapshot("PROJ-7");
    const backend = {
      atlassian: {
        getResource: vi.fn(),
      },
    } as unknown as BackendApi;

    integrationCacheHarness.readIntegrationCache.mockReturnValue({
      value: cachedSnapshot,
      updatedAt: Date.now(),
    });

    const graph = await buildTicketContextGraph({
      backend,
      project,
      ticket: rootTicket,
      projectTickets: [rootTicket],
    });

    expect(graph.nodes.get("PROJ-7")?.snapshot).toEqual(cachedSnapshot);
    expect(backend.atlassian.getResource).not.toHaveBeenCalled();
    expect(integrationCacheHarness.writeIntegrationCache).not.toHaveBeenCalled();
  });

  it("caps direct child expansion to a focused subset and reuses local ticket data", async () => {
    const project = createProject();
    const rootTicket = createTicket("PROJ-7");
    const childTickets = Array.from(
      { length: TICKET_CONTEXT_GRAPH_LIMITS.maxDirectChildren + 4 },
      (_, index) => createTicket(`PROJ-${100 + index}`),
    );
    const backend = {
      atlassian: {
        getResource: vi.fn(async (input: { ref: { id: string } }) => {
          if (input.ref.id !== "PROJ-7") {
            throw new Error(`unexpected fetch for ${input.ref.id}`);
          }
          return {
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
                subtasks: childTickets.map((ticket) => ({ key: ticket.ref.displayId })),
              },
            },
          } as ResourceSnapshot;
        }),
      },
    } as unknown as BackendApi;

    const graph = await buildTicketContextGraph({
      backend,
      project,
      ticket: rootTicket,
      projectTickets: [rootTicket, ...childTickets],
    });

    expect(graph.nodes.size).toBe(1 + TICKET_CONTEXT_GRAPH_LIMITS.maxDirectChildren);
    expect(graph.selectionSummary).toMatchObject({
      directChildrenIncluded: TICKET_CONTEXT_GRAPH_LIMITS.maxDirectChildren,
      directChildrenSkipped: 4,
    });
    expect(backend.atlassian.getResource).toHaveBeenCalledTimes(1);
  });
});
