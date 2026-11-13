import { describe, expect, it, vi } from "vite-plus/test";

import type { ProjectShellProject } from "@t3tools/project-context";
import type { BackendApi, ProjectMainRepositorySwitchResult } from "~/t3team/backend/t3team-types";
import { persistProjectMainRepository } from "./t3team-persistMainRepository";
import { readMainRepositoryFromProject } from "./t3team-projectMainRepository";

const ALPHA = "https://github.com/acme/alpha";
const ALPHA_CHECKOUT = "/tmp/home/.t3team/references/01-alpha";
const HOME = "/tmp/home";

const project = (raw: unknown = { agentReferences: { linkedRepositories: [{ url: ALPHA }] } }) =>
  ({
    id: "project-1",
    title: "Project",
    source: { provider: "atlassian", raw },
    workspace: { rootPath: HOME, createdAt: "2026-01-01T00:00:00.000Z" },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }) as unknown as ProjectShellProject;

const switched: ProjectMainRepositorySwitchResult = {
  changed: true,
  workspaceRoot: ALPHA_CHECKOUT,
  mainRepository: {
    url: ALPHA,
    checkoutPath: ALPHA_CHECKOUT,
    projectRoot: HOME,
    selection: "user",
  },
  migratedPaths: [],
};

describe("persistProjectMainRepository", () => {
  it("syncs, switches with selection user, and re-roots the project", async () => {
    const calls: Array<string> = [];
    const backend = {
      projectWorkspace: {
        syncLinkedRepository: vi.fn(async (input: { url: string }) => {
          calls.push(`sync ${input.url}`);
          return {
            linkedRepository: { url: input.url, localPath: ALPHA_CHECKOUT, status: "not-cloned" },
          };
        }),
        readLinkedRepositoryStatus: vi.fn(async () => ({
          linkedRepositories: [{ url: ALPHA, localPath: ALPHA_CHECKOUT, status: "cloned" }],
        })),
        setMainRepository: vi.fn(async (_input: unknown) => {
          calls.push("switch");
          return switched;
        }),
        bootstrapWorkspace: vi.fn(async () => {
          calls.push("scaffold");
          return {
            workspaceRoot: ALPHA_CHECKOUT,
            workspaceRepositoryInitialized: false,
            referencesRoot: `${HOME}/.t3team/references`,
            linkedRepositories: [],
            mainRepository: { url: ALPHA, localPath: ALPHA_CHECKOUT, status: "user" },
          };
        }),
      },
    } as unknown as BackendApi;

    const next = await persistProjectMainRepository({ backend, project: project(), url: ALPHA });
    expect(backend.projectWorkspace.setMainRepository).toHaveBeenCalledWith({
      projectId: "project-1",
      url: ALPHA,
      selection: "user",
    });
    expect(calls).toEqual([`sync ${ALPHA}`, "switch", "scaffold"]);
    expect(next.workspace?.rootPath).toBe(ALPHA_CHECKOUT);
    expect(readMainRepositoryFromProject(next)).toMatchObject({
      url: ALPHA,
      status: "user",
    });
  });

  it("clears the main without a sync, and surfaces a failure to the caller", async () => {
    const cleared: ProjectMainRepositorySwitchResult = {
      changed: true,
      workspaceRoot: HOME,
      mainRepository: { checkoutPath: HOME, projectRoot: HOME, selection: "user" },
      migratedPaths: [],
    };
    const backend = {
      projectWorkspace: {
        syncLinkedRepository: vi.fn(),
        setMainRepository: vi.fn(async () => cleared),
        bootstrapWorkspace: vi.fn(async () => ({
          workspaceRoot: HOME,
          workspaceRepositoryInitialized: false,
          referencesRoot: `${HOME}/.t3team/references`,
          linkedRepositories: [],
        })),
      },
    } as unknown as BackendApi;
    const next = await persistProjectMainRepository({ backend, project: project(), url: null });
    expect(backend.projectWorkspace.syncLinkedRepository).not.toHaveBeenCalled();
    expect(backend.projectWorkspace.setMainRepository).toHaveBeenCalledWith({
      projectId: "project-1",
      url: null,
      selection: "user",
    });
    expect(readMainRepositoryFromProject(next)?.url).toBeUndefined();

    const failing = {
      projectWorkspace: {
        syncLinkedRepository: vi.fn(),
        setMainRepository: vi.fn(async () => {
          throw new Error("refused");
        }),
      },
    } as unknown as BackendApi;
    await expect(
      persistProjectMainRepository({ backend: failing, project: project(), url: null }),
    ).rejects.toThrow("refused");
  });
});
