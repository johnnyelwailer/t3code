import {
  buildJiraTicketCacheRoot,
  buildJiraTicketEntryPoint,
} from "@t3tools/project-context/t3teamContextPaths";
import type { ProjectShellProject } from "@t3tools/project-context";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const backendHarness = vi.hoisted(() => ({
  refreshWorkItemContext: vi.fn(),
}));

import type { BackendApi } from "~/t3team/backend/t3team-types";
import { buildT3TeamWorkItemDedupeKey } from "~/t3team/t3team-contextAttachmentDedupeKey";
import { persistWorkItemContextBundle } from "~/t3team/t3team-workItemContextBundlePersist";

function createProject(overrides?: { workspace?: unknown }): ProjectShellProject {
  return {
    id: "project-alpha",
    title: "Project Alpha",
    workspace: { rootPath: "/tmp/project-alpha" },
    ...overrides,
  } as unknown as ProjectShellProject;
}

function createBackend(): BackendApi {
  return {
    projectWorkspace: {
      refreshWorkItemContext: backendHarness.refreshWorkItemContext,
    },
  } as unknown as BackendApi;
}

beforeEach(() => {
  backendHarness.refreshWorkItemContext.mockReset();
  backendHarness.refreshWorkItemContext.mockImplementation(async (input) => ({
    ok: true,
    status: "synced" as const,
    projectId: input.projectId,
    ticketKey: input.ticketKey,
    availability: "full" as const,
    entryPointRelativePath: buildJiraTicketEntryPoint(input.projectId, input.ticketKey),
    manifestRelativePath: `${buildJiraTicketCacheRoot(input.projectId, input.ticketKey)}/manifest.json`,
    includedCount: 1,
    skippedCount: 0,
  }));
});

describe("persistWorkItemContextBundle", () => {
  it("refreshes the bundle and persists it under the canonical work-item dedupe key", async () => {
    const progressPaths: Array<string | undefined> = [];
    const payload = await persistWorkItemContextBundle({
      backend: createBackend(),
      project: createProject(),
      ticketKey: "NXAI-8",
      targetLabel: "NXAI-8 Composer work-item references",
      onProgress: (input) => progressPaths.push(input.relativePath),
    });

    expect(backendHarness.refreshWorkItemContext).toHaveBeenCalledWith({
      workspaceRoot: "/tmp/project-alpha",
      projectId: "project-alpha",
      ticketKey: "NXAI-8",
    });
    expect(payload.dedupeKey).toBe(
      buildT3TeamWorkItemDedupeKey({ projectId: "project-alpha", workItemKey: "NXAI-8" }),
    );
    expect(payload.bundleRootRelativePath).toBe(
      buildJiraTicketCacheRoot("project-alpha", "NXAI-8"),
    );
    const lightweightItem = payload.lightweightItem as { kind: string; label: string };
    expect(lightweightItem.kind).toBe("jira-work-item");
    expect(lightweightItem.label).toBe("NXAI-8 Composer work-item references");
    expect(progressPaths.at(-1)).toBe(buildJiraTicketEntryPoint("project-alpha", "NXAI-8"));
  });

  it("defaults the label to the ticket key and passes force through", async () => {
    const payload = await persistWorkItemContextBundle({
      backend: createBackend(),
      project: createProject(),
      ticketKey: "NXAI-8",
      force: true,
    });

    expect(backendHarness.refreshWorkItemContext).toHaveBeenCalledWith({
      workspaceRoot: "/tmp/project-alpha",
      projectId: "project-alpha",
      ticketKey: "NXAI-8",
      force: true,
    });
    expect((payload.lightweightItem as { label: string }).label).toBe("NXAI-8");
  });

  it("requires a managed project workspace", async () => {
    await expect(
      persistWorkItemContextBundle({
        backend: createBackend(),
        project: createProject({ workspace: undefined }),
        ticketKey: "NXAI-8",
      }),
    ).rejects.toThrow("Attached context requires a managed project workspace.");
  });
});
