/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ProjectShellProject } from "@t3tools/project-context";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { BackendProvider } from "~/t3work/backend/t3work-BackendContext";
import type { AtlassianBacklogResponse, BackendApi } from "~/t3work/backend/t3work-types";
import { resetProjectWorkspaceSyncStateForTests } from "~/t3work/t3work-projectWorkspaceSync";

import { useProjectBacklog } from "./t3work-useProjectBacklog";

function createBacklogResponse(): AtlassianBacklogResponse {
  return {
    page: {
      items: [
        {
          provider: "atlassian",
          kind: "issue",
          id: "PROJ-1",
          displayId: "PROJ-1",
          title: "Synced backlog issue",
          url: "https://example.test/browse/PROJ-1",
          projectId: "10008",
          status: "To Do",
          type: "Task",
        },
      ],
      totalCount: 1,
    },
    capabilities: { canCreateSubtasks: true },
    boards: [],
    sprints: [],
    savedFilters: [],
    cache: {
      source: "persisted",
      updatedAt: Date.now(),
      fingerprint: "sha256:backlog-sync-test",
    },
  };
}

function createProject(): ProjectShellProject {
  return {
    id: "project-1" as ProjectShellProject["id"],
    title: "Project 1",
    source: {
      provider: "atlassian",
      accountId: "acct-1",
      externalProjectId: "10008",
      raw: {
        agentReferences: {
          linkedRepositories: [{ url: "https://github.com/example/project-1" }],
        },
        agentSetup: { profileId: "engineering-copilot" },
      },
    },
    workspace: {
      rootPath: "/tmp/project-1-backlog-sync-test",
      createdAt: "2026-05-21T18:30:35.000Z",
    },
    createdAt: "2026-05-21T18:30:35.000Z",
    updatedAt: "2026-05-21T18:30:35.000Z",
  };
}

function BacklogHarness({ project }: { project: ProjectShellProject }) {
  const { tickets } = useProjectBacklog(project);
  return <div data-testid="ticket-count">{String(tickets.length)}</div>;
}

describe("useProjectBacklog workspace sync", () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  afterEach(async () => {
    resetProjectWorkspaceSyncStateForTests();
    if (root) {
      await act(async () => root?.unmount());
    }
    host?.remove();
    root = null;
    host = null;
    vi.clearAllMocks();
  });

  it("writes loaded backlog tickets into the project workspace context", async () => {
    const backlogResponse = createBacklogResponse();
    const writeContextFiles = vi.fn(
      async (input: { files: ReadonlyArray<{ relativePath: string }> }) => ({
        workspaceRoot: "/tmp/project-1-backlog-sync-test",
        writtenFiles: input.files.map((file) => file.relativePath),
      }),
    );
    const backend = {
      state: {
        connectionStatus: "connected",
        serverConfig: null,
        providers: [],
        error: null,
      },
      connect: vi.fn(async () => undefined),
      disconnect: vi.fn(async () => undefined),
      dispatchCommand: vi.fn(async () => undefined),
      launchRecipeWorkflow: vi.fn(async () => ({ ok: true })),
      submitRecipeCardAction: vi.fn(async () => ({ ok: true })),
      resolveWorkflowInput: vi.fn(async () => undefined),
      listThreadPlacements: vi.fn(async () => []),
      syncThreadToolContext: vi.fn(async () => undefined),
      atlassian: {
        listBacklog: vi.fn(async () => backlogResponse),
      } as unknown as BackendApi["atlassian"],
      github: {} as BackendApi["github"],
      projectWorkspace: {
        bootstrapWorkspace: vi.fn(async () => ({
          workspaceRoot: "/tmp/project-1-backlog-sync-test",
          workspaceRepositoryInitialized: true,
          referencesRoot: "/tmp/project-1-backlog-sync-test/.t3work/references",
          linkedRepositories: [],
        })),
        discoverRecipes: vi.fn(async () => ({
          workspaceRoot: "/tmp/project-1-backlog-sync-test",
          hasProjectLocalRecipes: false,
          recipes: [],
        })),
        writeContextFiles,
      },
    } satisfies BackendApi;

    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);

    await act(async () => {
      root?.render(
        <BackendProvider backend={backend}>
          <BacklogHarness project={createProject()} />
        </BackendProvider>,
      );
    });

    await vi.waitFor(() => {
      expect(host?.querySelector('[data-testid="ticket-count"]')?.textContent).toBe("1");
    });
    await vi.waitFor(() => {
      expect(
        writeContextFiles.mock.calls.some(([input]) =>
          input.files.some(
            (file) => file.relativePath === ".t3work/context/work-items/proj-1.json",
          ),
        ),
      ).toBe(true);
    });
  });
});
