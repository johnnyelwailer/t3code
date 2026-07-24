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

function createSnapshot(input: { key: string; title: string; raw?: unknown }): ResourceSnapshot {
  return {
    ref: {
      provider: "atlassian",
      kind: "issue",
      id: input.key,
      displayId: input.key,
      title: input.title,
      projectId: "PROJ",
      updatedAt: "2026-05-18T12:00:00.000Z",
    },
    fetchedAt: "2026-05-18T12:34:56.000Z",
    fields: {},
    ...(input.raw ? { raw: input.raw } : {}),
  };
}

function createBackend(getResource: (key: string) => Promise<ResourceSnapshot>): BackendApi {
  return {
    atlassian: {
      getResource: vi.fn(async (input: { ref: { id: string } }) => getResource(input.ref.id)),
    },
  } as unknown as BackendApi;
}

beforeEach(() => {
  integrationCacheHarness.readIntegrationCache.mockReset();
  integrationCacheHarness.readIntegrationCache.mockReturnValue(null);
  integrationCacheHarness.writeIntegrationCache.mockReset();
});

describe("buildTicketContextGraph", () => {
  it("recursively fetches parent, child, and reference nodes from snapshot relationships", async () => {
    const project = createProject();
    const rootTicket = createTicket("PROJ-7");
    const childTicket = createTicket("PROJ-8");
    const snapshots = new Map<string, ResourceSnapshot>([
      [
        "PROJ-7",
        createSnapshot({
          key: "PROJ-7",
          title: "Root ticket",
          raw: {
            fields: {
              subtasks: [{ key: "PROJ-8" }],
              issuelinks: [{ outwardIssue: { key: " PROJ-9 " } }],
            },
          },
        }),
      ],
      [
        "PROJ-8",
        createSnapshot({
          key: "PROJ-8",
          title: "Child ticket",
          raw: {
            fields: {
              parent: { key: "PROJ-7" },
            },
          },
        }),
      ],
      [
        "PROJ-9",
        createSnapshot({
          key: "PROJ-9",
          title: "Referenced ticket",
          raw: { fields: {} },
        }),
      ],
    ]);
    const backend = createBackend(async (key) => snapshots.get(key)!);

    const graph = await buildTicketContextGraph({
      backend,
      project,
      ticket: rootTicket,
      projectTickets: [rootTicket, childTicket],
    });

    expect(graph.rootKey).toBe("PROJ-7");
    expect([...graph.nodes.keys()]).toEqual(["PROJ-7", "PROJ-8", "PROJ-9"]);
    expect(graph.nodes.get("PROJ-7")).toMatchObject({
      ticket: rootTicket,
      relationshipKeys: {
        childKeys: ["PROJ-8"],
        referenceKeys: ["PROJ-9"],
      },
    });
    expect(graph.nodes.get("PROJ-8")).toMatchObject({
      ticket: childTicket,
      relationshipKeys: {
        parentKey: "PROJ-7",
        childKeys: [],
        referenceKeys: [],
      },
    });
    expect(graph.nodes.get("PROJ-9")?.ticket).toBeNull();
    expect(integrationCacheHarness.writeIntegrationCache).toHaveBeenCalledTimes(2);
  });

  it("records fetch failures on discovered nodes without crashing graph construction", async () => {
    const project = createProject();
    const rootTicket = createTicket("PROJ-7");
    const backend = createBackend(async (key) => {
      if (key === "PROJ-8") {
        throw new Error("missing snapshot");
      }
      return createSnapshot({
        key,
        title: `Ticket ${key}`,
        raw: {
          fields: {
            subtasks: key === "PROJ-7" ? [{ key: "PROJ-8" }] : [],
          },
        },
      });
    });

    const graph = await buildTicketContextGraph({
      backend,
      project,
      ticket: rootTicket,
      projectTickets: [rootTicket],
    });

    expect(graph.nodes.get("PROJ-8")).toMatchObject({
      ticket: null,
      snapshot: null,
      error: "missing snapshot",
      relationshipKeys: {
        childKeys: [],
        referenceKeys: [],
      },
    });
  });
});
