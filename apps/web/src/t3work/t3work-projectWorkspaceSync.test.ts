import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { ProjectShellProject } from "@t3tools/project-context";
import { T3WORK_PROJECT_CONTEXT_ENTRYPOINT_PATH } from "~/t3work/t3work-projectSetup";

import type { BackendApi } from "~/t3work/backend/t3work-types";
import {
  buildProjectWorkspaceSyncFiles,
  retainProjectWorkspaceSync,
  resetProjectWorkspaceSyncStateForTests,
  syncProjectWorkspaceContext,
} from "~/t3work/t3work-projectWorkspaceSync";
import type { ProjectTicket } from "~/t3work/t3work-types";

function createProject(): ProjectShellProject {
  return {
    id: "Project Alpha" as ProjectShellProject["id"],
    title: "Project Alpha",
    source: {
      provider: "atlassian",
      accountId: "acct-1",
      externalProjectId: "proj-1",
      externalProjectKey: "PROJ",
      raw: {
        agentSetup: {
          profileId: "product-owner",
        },
      },
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

function createBackendHarness() {
  return {
    bootstrapWorkspace: vi.fn(async () => ({
      workspaceRoot: "/tmp/project-alpha",
      workspaceRepositoryInitialized: true,
      referencesRoot: "/tmp/project-alpha/.t3work/references",
      linkedRepositories: [],
    })),
    writeContextFiles: vi.fn(async (input: { files: ReadonlyArray<{ relativePath: string }> }) => ({
      workspaceRoot: "/tmp/project-alpha",
      writtenFiles: input.files.map((file) => file.relativePath),
    })),
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.useFakeTimers();
  resetProjectWorkspaceSyncStateForTests();
});

afterEach(() => {
  resetProjectWorkspaceSyncStateForTests();
  vi.useRealTimers();
});

describe("buildProjectWorkspaceSyncFiles", () => {
  it("writes the canonical project bundle into .t3work/context without a duplicate project.json", () => {
    const files = buildProjectWorkspaceSyncFiles({
      project: createProject(),
      linkedRepositoryUrls: ["https://github.com/example/project-alpha"],
      projectTickets: [createTicket("PROJ-1")],
    });

    expect(files.some((file) => file.relativePath === T3WORK_PROJECT_CONTEXT_ENTRYPOINT_PATH)).toBe(
      true,
    );
    expect(files.some((file) => file.relativePath === ".t3work/context/metadata.json")).toBe(true);
    expect(files.some((file) => file.relativePath === ".t3work/context/project.json")).toBe(false);

    const entrypoint = files.find(
      (file) => file.relativePath === T3WORK_PROJECT_CONTEXT_ENTRYPOINT_PATH,
    );
    expect(JSON.parse(entrypoint?.contents ?? "{}")).toMatchObject({
      contextRoot: ".t3work/context",
      projectEntryPointPath: ".t3work/context/entrypoint.json",
      profilePath: ".t3work/setup/profile.json",
      paths: {
        metadata: ".t3work/context/metadata.json",
      },
    });
  });
});

describe("syncProjectWorkspaceContext", () => {
  it("coalesces duplicate sync requests for the same project state", async () => {
    const backendHarness = createBackendHarness();
    const backend = {
      projectWorkspace: {
        bootstrapWorkspace: backendHarness.bootstrapWorkspace,
        discoverRecipes: vi.fn(async () => ({
          workspaceRoot: "/tmp/project-alpha",
          hasProjectLocalRecipes: false,
          recipes: [],
        })),
        writeContextFiles: backendHarness.writeContextFiles,
      },
    } as unknown as BackendApi;
    const input = {
      backend,
      project: createProject(),
      linkedRepositoryUrls: ["https://github.com/example/project-alpha"],
      projectTickets: [createTicket("PROJ-1")],
    };

    const syncs = Promise.all([
      syncProjectWorkspaceContext(input),
      syncProjectWorkspaceContext(input),
    ]);
    await vi.advanceTimersByTimeAsync(150);
    await syncs;

    expect(backendHarness.bootstrapWorkspace).toHaveBeenCalledTimes(1);
    expect(backendHarness.writeContextFiles).toHaveBeenCalledTimes(1);
  });

  it("debounces and writes only the latest queued payload", async () => {
    const backendHarness = createBackendHarness();
    const backend = {
      projectWorkspace: {
        bootstrapWorkspace: backendHarness.bootstrapWorkspace,
        discoverRecipes: vi.fn(async () => ({
          workspaceRoot: "/tmp/project-alpha",
          hasProjectLocalRecipes: false,
          recipes: [],
        })),
        writeContextFiles: backendHarness.writeContextFiles,
      },
    } as unknown as BackendApi;
    const baseInput = {
      backend,
      project: createProject(),
      linkedRepositoryUrls: ["https://github.com/example/project-alpha"],
    };

    const stale = syncProjectWorkspaceContext({
      ...baseInput,
      projectTickets: [createTicket("PROJ-1")],
    });
    const latest = syncProjectWorkspaceContext({
      ...baseInput,
      projectTickets: [createTicket("PROJ-2")],
    });
    await vi.advanceTimersByTimeAsync(150);
    await Promise.all([stale, latest]);

    expect(backendHarness.writeContextFiles).toHaveBeenCalledTimes(1);
    const writtenFiles = backendHarness.writeContextFiles.mock.calls[0]?.[0].files ?? [];
    expect(writtenFiles.some((file) => file.relativePath.endsWith("/proj-1.json"))).toBe(false);
    expect(writtenFiles.some((file) => file.relativePath.endsWith("/proj-2.json"))).toBe(true);
  });

  it("retries the latest payload after a failed write while retained", async () => {
    const backendHarness = createBackendHarness();
    backendHarness.writeContextFiles
      .mockRejectedValueOnce(new Error("disk unavailable"))
      .mockResolvedValueOnce({
        workspaceRoot: "/tmp/project-alpha",
        writtenFiles: [],
      });
    const backend = {
      projectWorkspace: {
        bootstrapWorkspace: backendHarness.bootstrapWorkspace,
        discoverRecipes: vi.fn(async () => ({
          workspaceRoot: "/tmp/project-alpha",
          hasProjectLocalRecipes: false,
          recipes: [],
        })),
        writeContextFiles: backendHarness.writeContextFiles,
      },
    } as unknown as BackendApi;
    const release = retainProjectWorkspaceSync("/tmp/project-alpha");
    const input = {
      backend,
      project: createProject(),
      linkedRepositoryUrls: ["https://github.com/example/project-alpha"],
      projectTickets: [createTicket("PROJ-1")],
    };

    const firstAttempt = syncProjectWorkspaceContext(input);
    const firstAttemptExpectation = expect(firstAttempt).rejects.toThrow("disk unavailable");
    await vi.advanceTimersByTimeAsync(150);
    await firstAttemptExpectation;
    await vi.runOnlyPendingTimersAsync();
    await vi.runOnlyPendingTimersAsync();

    expect(backendHarness.writeContextFiles).toHaveBeenCalledTimes(2);
    release();
  });

  it("serializes newer writes after an in-flight older write", async () => {
    const backendHarness = createBackendHarness();
    const firstWrite = createDeferred<{ workspaceRoot: string; writtenFiles: string[] }>();
    backendHarness.writeContextFiles.mockReturnValueOnce(firstWrite.promise).mockResolvedValueOnce({
      workspaceRoot: "/tmp/project-alpha",
      writtenFiles: [],
    });
    const backend = {
      projectWorkspace: {
        bootstrapWorkspace: backendHarness.bootstrapWorkspace,
        discoverRecipes: vi.fn(async () => ({
          workspaceRoot: "/tmp/project-alpha",
          hasProjectLocalRecipes: false,
          recipes: [],
        })),
        writeContextFiles: backendHarness.writeContextFiles,
      },
    } as unknown as BackendApi;
    const baseInput = {
      backend,
      project: createProject(),
      linkedRepositoryUrls: ["https://github.com/example/project-alpha"],
    };

    const stale = syncProjectWorkspaceContext({
      ...baseInput,
      projectTickets: [createTicket("PROJ-1")],
    });
    await vi.advanceTimersByTimeAsync(150);
    expect(backendHarness.writeContextFiles).toHaveBeenCalledTimes(1);
    const latest = syncProjectWorkspaceContext({
      ...baseInput,
      projectTickets: [createTicket("PROJ-2")],
    });
    firstWrite.resolve({ workspaceRoot: "/tmp/project-alpha", writtenFiles: [] });
    await stale;
    await vi.advanceTimersByTimeAsync(0);
    await latest;

    expect(backendHarness.writeContextFiles).toHaveBeenCalledTimes(2);
    const finalFiles = backendHarness.writeContextFiles.mock.calls[1]?.[0].files ?? [];
    expect(finalFiles.some((file) => file.relativePath.endsWith("/proj-2.json"))).toBe(true);
  });
});
