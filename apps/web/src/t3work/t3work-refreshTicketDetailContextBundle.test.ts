import { describe, expect, it, vi } from "vite-plus/test";

import type { ProjectShellProject } from "@t3tools/project-context";
import type { BackendApi } from "~/t3work/backend/t3work-types";
import type { ProjectTicket } from "~/t3work/t3work-types";
import {
  buildServerOwnedTicketDetailContextBundle,
  refreshTicketDetailContextBundle,
} from "~/t3work/t3work-refreshTicketDetailContextBundle";

describe("buildServerOwnedTicketDetailContextBundle", () => {
  it("builds a lightweight focused bundle that points at server-written entrypoints", () => {
    const bundle = buildServerOwnedTicketDetailContextBundle({
      projectId: "project-alpha",
      ticketKey: "PROJ-7",
      focusKind: "jira-ticket-comments",
      targetLabel: "Comments",
      summaryItems: [{ label: "Count", value: "4" }],
      focusEntryPointRelativePath:
        ".t3work/context/jira/project-alpha/items/proj-7/focus/jira-ticket-comments.json",
      ticketEntryPointRelativePath:
        ".t3work/context/jira/project-alpha/items/proj-7/entrypoint.json",
    });

    expect(bundle.files).toEqual([]);
    expect(bundle.fileReferences[0]).toEqual({
      label: "Focused context",
      relativePath:
        ".t3work/context/jira/project-alpha/items/proj-7/focus/jira-ticket-comments.json",
    });
    expect(bundle.dedupeKey).toBe("project-alpha:PROJ-7:jira-ticket-comments");
  });
});

describe("refreshTicketDetailContextBundle", () => {
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

  it("calls the server slice refresh route and returns a server-owned bundle", async () => {
    const refreshWorkItemSliceContext = vi.fn(async () => ({
      ok: true,
      status: "synced" as const,
      projectId: "project-alpha",
      ticketKey: "PROJ-7",
      focusKind: "jira-ticket-comments",
      availability: "full" as const,
      focusEntryPointRelativePath:
        ".t3work/context/jira/project-alpha/items/proj-7/focus/jira-ticket-comments.json",
      entryPointRelativePath: ".t3work/context/jira/project-alpha/items/proj-7/entrypoint.json",
      includedCount: 2,
      skippedCount: 0,
    }));
    const backend = {
      projectWorkspace: { refreshWorkItemSliceContext },
    } as unknown as BackendApi;

    const bundle = await refreshTicketDetailContextBundle({
      backend,
      project,
      ticket,
      target: "comments",
      targetLabel: "Comments",
      summaryItems: [{ label: "Count", value: "4" }],
    });

    expect(refreshWorkItemSliceContext).toHaveBeenCalledWith({
      workspaceRoot: "/tmp/project-alpha",
      projectId: "project-alpha",
      ticketKey: "PROJ-7",
      focusKind: "jira-ticket-comments",
      focusLabel: "Comments",
      summaryItems: [{ label: "Count", value: "4" }],
    });
    expect(bundle.files).toEqual([]);
    expect(bundle.fileReferences[0]?.relativePath).toContain("focus/jira-ticket-comments.json");
  });
});
