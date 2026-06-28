import { describe, expect, it, vi } from "vite-plus/test";

import type { ProjectShellProject } from "@t3tools/project-context";
import type { BackendApi } from "~/t3work/backend/t3work-types";
import type { ProjectTicket } from "~/t3work/t3work-types";
import {
  buildServerOwnedWorkItemContextBundle,
  refreshWorkItemContextBundle,
} from "~/t3work/t3work-refreshWorkItemContextBundle";

describe("buildServerOwnedWorkItemContextBundle", () => {
  it("builds a lightweight bundle that points at server-written entrypoints", () => {
    const bundle = buildServerOwnedWorkItemContextBundle({
      projectId: "project-alpha",
      ticketKey: "PROJ-7",
      targetLabel: "PROJ-7 Investigate context sync",
      summaryItems: [{ label: "Status", value: "In Progress" }],
      entryPointRelativePath: ".t3work/context/jira/project-alpha/items/proj-7/entrypoint.json",
    });

    expect(bundle.files).toEqual([]);
    expect(bundle.fileReferences).toEqual([
      {
        label: "Ticket entrypoint",
        relativePath: ".t3work/context/jira/project-alpha/items/proj-7/entrypoint.json",
      },
    ]);
    expect(bundle.dedupeKey).toBe("project-alpha:PROJ-7:work-item");
  });
});

describe("refreshWorkItemContextBundle", () => {
  const project = {
    id: "project-alpha",
    title: "Project Alpha",
    workspace: { rootPath: "/tmp/project-alpha" },
  } as ProjectShellProject;

  const ticket = {
    id: "ticket-1",
    projectId: "project-alpha",
    ref: {
      provider: "atlassian",
      kind: "issue",
      id: "10001",
      displayId: "PROJ-7",
      title: "Investigate context sync",
      url: "https://example.test/browse/PROJ-7",
      projectId: "jira-proj",
    },
  } as ProjectTicket;

  it("calls the server refresh route and returns a server-owned bundle", async () => {
    const refreshWorkItemContext = vi.fn(async () => ({
      ok: true,
      status: "synced" as const,
      projectId: "project-alpha",
      ticketKey: "PROJ-7",
      availability: "full" as const,
      entryPointRelativePath: ".t3work/context/jira/project-alpha/items/proj-7/entrypoint.json",
      manifestRelativePath: ".t3work/context/jira/project-alpha/items/proj-7/manifest.json",
      includedCount: 3,
      skippedCount: 1,
      backgroundQueued: 5,
    }));
    const backend = {
      projectWorkspace: { refreshWorkItemContext },
    } as unknown as BackendApi;
    const progress: string[] = [];

    const bundle = await refreshWorkItemContextBundle({
      backend,
      project,
      ticket,
      summaryItems: [{ label: "Status", value: "In Progress" }],
      onProgress: (update) => {
        progress.push(update.phase);
      },
    });

    expect(refreshWorkItemContext).toHaveBeenCalledWith({
      workspaceRoot: "/tmp/project-alpha",
      projectId: "project-alpha",
      ticketKey: "PROJ-7",
    });
    expect(bundle.files).toEqual([]);
    expect(bundle.fileReferences[0]?.relativePath).toContain("proj-7/entrypoint.json");
    expect(progress).toEqual(["Refreshing work item context", "Work item context refreshed"]);
  });
});
