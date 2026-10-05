import { describe, expect, it, vi } from "vite-plus/test";

import type { ProjectShellProject } from "@t3tools/project-context";
import type { BackendApi } from "~/t3team/backend/t3team-types";
import { createRecordingOrchestrationApi } from "~/t3team/backend/t3team-orchestrationApi.testSupport";
import { finalizeCreatedProject } from "~/t3team/hooks/t3team-createProjectFinalization";

/**
 * Defect-1 regression: the Jira/work-source binding must reach the server on `project.create`.
 * Before the fix, `finalizeCreatedProject` dispatched `project.create` with no `source` at all — the
 * binding only ever lived in client state, so a fresh server state dir lost it entirely and the
 * loose-workspace synthesis path fabricated a fake `local` one in its place. See
 * `apps/web/src/t3team/t3team-projectSourceBinding.ts` and `t3team-projectStoreUtils.ts`.
 */

function createBackend(createProject: BackendApi["orchestration"]["createProject"]): BackendApi {
  return {
    state: { connectionStatus: "connected", serverConfig: null, providers: [], error: null },
    connect: vi.fn(async () => undefined),
    disconnect: vi.fn(async () => undefined),
    orchestration: { ...createRecordingOrchestrationApi(), createProject },
    launchRecipeWorkflow: vi.fn(async () => ({ ok: true })),
    submitRecipeCardAction: vi.fn(async () => ({ ok: true })),
    resolveWorkflowInput: vi.fn(async () => undefined),
    listThreadPlacements: vi.fn(async () => []),
    syncThreadToolContext: vi.fn(async () => undefined),
    atlassian: {} as BackendApi["atlassian"],
    github: {} as BackendApi["github"],
    projectWorkspace: {
      bootstrapWorkspace: vi.fn(async () => ({
        workspaceRoot: "/tmp/project-alpha",
        workspaceRepositoryInitialized: true,
        referencesRoot: "/tmp/project-alpha/.t3team/references",
        linkedRepositories: [],
      })),
      discoverRecipes: vi.fn(async () => ({
        workspaceRoot: "/tmp/project-alpha",
        hasProjectLocalRecipes: false,
        recipes: [],
      })),
      writeContextFiles: vi.fn(async () => ({
        workspaceRoot: "/tmp/project-alpha",
        writtenFiles: [],
      })),
      refreshWorkItemContext: vi.fn(),
      refreshWorkItemSliceContext: vi.fn(),
    } as unknown as BackendApi["projectWorkspace"],
  };
}

function createJiraProject(): ProjectShellProject {
  return {
    id: "project-alpha" as ProjectShellProject["id"],
    title: "Project Alpha",
    source: {
      provider: "atlassian",
      accountId: "acc-1",
      externalProjectId: "10001",
      externalProjectKey: "INT",
    },
    workspace: {
      rootPath: "/tmp/project-alpha",
      createdAt: "2026-05-18T00:00:00.000Z",
    },
    createdAt: "2026-05-18T00:00:00.000Z",
    updatedAt: "2026-05-18T00:00:00.000Z",
  };
}

function createLocalProject(): ProjectShellProject {
  return {
    id: "project-loose" as ProjectShellProject["id"],
    title: "Loose Workspace",
    source: { provider: "local" },
    workspace: {
      rootPath: "/tmp/project-loose",
      createdAt: "2026-05-18T00:00:00.000Z",
    },
    createdAt: "2026-05-18T00:00:00.000Z",
    updatedAt: "2026-05-18T00:00:00.000Z",
  };
}

describe("finalizeCreatedProject", () => {
  it("creates the project carrying the work-source binding (Defect 1)", async () => {
    const createProject = vi.fn<BackendApi["orchestration"]["createProject"]>(
      async () => undefined,
    );
    const backend = createBackend(createProject);

    await finalizeCreatedProject({
      backend,
      project: createJiraProject(),
      linkedRepositoryUrls: [],
      setupProfileId: "product-partner",
    });

    expect(createProject).toHaveBeenCalledTimes(1);
    const dispatched = createProject.mock.calls[0]?.[0];
    expect(dispatched?.source).toEqual({
      provider: "atlassian",
      accountId: "acc-1",
      externalProjectId: "10001",
      externalProjectKey: "INT",
    });
  });

  it("creates the project with a local binding for a loose workspace", async () => {
    const createProject = vi.fn<BackendApi["orchestration"]["createProject"]>(
      async () => undefined,
    );
    const backend = createBackend(createProject);

    await finalizeCreatedProject({
      backend,
      project: createLocalProject(),
      linkedRepositoryUrls: [],
      setupProfileId: "product-partner",
    });

    expect(createProject).toHaveBeenCalledTimes(1);
    const dispatched = createProject.mock.calls[0]?.[0];
    expect(dispatched?.source).toEqual({ provider: "local" });
  });

  it("surfaces a friendly message when the binding is already claimed", async () => {
    const createProject = vi.fn(async () => {
      throw new Error(
        "Work source 'atlassian:acc-1/10001' is already bound to project 'project-other'.",
      );
    });
    const backend = createBackend(createProject);

    await expect(
      finalizeCreatedProject({
        backend,
        project: createJiraProject(),
        linkedRepositoryUrls: [],
        setupProfileId: "product-partner",
      }),
    ).rejects.toThrow("This project is already added");
  });
});
